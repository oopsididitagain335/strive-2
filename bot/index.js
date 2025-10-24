// /bot/index.js
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } from 'discord.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { encryptJSON, decryptJSON } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// === ENV VALIDATION ===
const requiredEnv = [
  'DISCORD_TOKEN',
  'MONGO_URI',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'SESSION_KEY',
  'REDIRECT_URI',
  'ENCRYPTION_SECRET',
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 10000}`;
const PORT = process.env.PORT || 10000;

// === DISCORD CLIENT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.User],
  allowedMentions: { parse: [], repliedUser: false },
  rest: { timeout: 15_000 },
});
client.commands = new Collection();

// === DATABASE ===
try {
  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  logger.info('✅ Connected to MongoDB');
} catch (err) {
  console.error('❌ Failed to connect to MongoDB:', err);
  process.exit(1);
}

// === UTILS: recursive command loader ===
const loadCommandsRecursively = async (dir) => {
  const commands = [];
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const path = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      commands.push(...(await loadCommandsRecursively(path)));
    } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
      try {
        const command = await import(`file://${path}`);
        if (command.data && typeof command.execute === 'function') {
          commands.push(command);
        }
      } catch (err) {
        console.error(`Failed to load command ${path}:`, err);
      }
    }
  }
  return commands;
};

// Load commands from **root `commands/` folder**
const allCommands = await loadCommandsRecursively(join(PROJECT_ROOT, 'commands'));
for (const cmd of allCommands) client.commands.set(cmd.data.name, cmd);
logger.info(`✅ Loaded ${allCommands.length} commands`);

// === REGISTER GLOBAL COMMANDS ===
client.once('ready', async () => {
  logger.info(`🤖 Logged in as ${client.user.tag} (${client.user.id})`);
  try {
    const commandData = allCommands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commandData);
    logger.info(`📡 Registered ${commandData.length} global commands`);
  } catch (err) {
    console.warn('⚠️ Failed to register global commands:', err);
  }
});

// === LOAD EVENTS ===
try {
  const eventsPath = join(__dirname, 'events'); // events inside bot/
  const eventFiles = await fs.readdir(eventsPath, { withFileTypes: true });
  for (const file of eventFiles) {
    if (file.isFile() && file.name.endsWith('.js')) {
      const filePath = join(eventsPath, file.name);
      const event = await import(`file://${filePath}`);
      if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
      else client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
} catch (err) {
  logger.warn('No events directory found or failed to load events:', err);
}

// === EXPRESS DASHBOARD ===
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(PROJECT_ROOT, 'dashboard', 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, collection: 'sessions' }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
}));

function ensureAuth(req, res, next) {
  if (!req.session?.discordUser) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?redirect=${redirect}`);
  }
  next();
}

// === OAuth routes ===
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  const state = encodeURIComponent(redirect);
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('❌ Missing code.');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokens));

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const user = await userRes.json();
    const guilds = await guildsRes.json();

    req.session.discordUser = user;
    req.session.userGuilds = guilds;

    let redirect = '/dashboard';
    if (state) {
      try {
        redirect = decodeURIComponent(state);
        if (!redirect.startsWith('/')) redirect = '/dashboard';
      } catch (e) {
        redirect = '/dashboard';
      }
    }

    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('❌ Login failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// === API routes ===
app.get('/api/user', ensureAuth, (req, res) => {
  const { id, username, avatar } = req.session.discordUser;
  res.json({
    user: { id, username, avatar: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null },
  });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const manageable = (req.session.userGuilds || [])
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n)
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
    }));
  res.json({ servers: manageable });
});

app.get('/api/bot-status', (req, res) => {
  res.json({
    connected: !!client.user,
    bot: client.user ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() } : null,
    guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name })),
  });
});

// Serve setup panel
app.get('/setup.html', ensureAuth, (req, res) => {
  res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html'));
});

// Other dashboard routes
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/verify', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'success.html')));
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Dashboard running at ${BASE_URL}`);
});

// Start Discord client
try {
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`✅ Bot connected as ${client.user.tag} (${client.user.id}) — serving ${client.guilds.cache.size} guild(s)`);
} catch (err) {
  console.error('❌ Failed to log in to Discord:', err);
  process.exit(1);
}

// Graceful shutdown
async function shutdown(signal) {
  console.warn(`Received ${signal} — shutting down...`);
  try {
    await client.destroy();
    await mongoose.disconnect();
    if (client.redis) await client.redis.quit();
  } catch (err) {
    console.error('Shutdown error:', err);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
