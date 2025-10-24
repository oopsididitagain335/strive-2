// /bot/index.js
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
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

// Shared logger
import { logger } from '../utils/logger.js';
import { initAudit } from './utils/audit.js';
import { initRateLimiter } from './utils/rateLimiter.js';
import { initSecurity } from './security/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Validate env
const requiredEnv = ['DISCORD_TOKEN', 'MONGO_URI', 'CLIENT_ID', 'ADMIN_ID', 'SESSION_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.fatal(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// === DISCORD BOT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  allowedMentions: { parse: [], repliedUser: false },
  rest: { timeout: 15_000 },
  shards: 'auto',
});

client.commands = new Collection();

process.on('unhandledRejection', (reason) => {
  logger.warn('⚠️ Unhandled Rejection:', reason?.message || String(reason));
});

process.on('uncaughtException', (err) => {
  logger.error('🔥 Uncaught Exception:', {
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 3).join('\n'),
  });
  if (err.message?.includes('TOKEN_INVALID') || err.message?.includes('401')) {
    logger.fatal('Bot token invalid — shutting down.');
    process.exit(1);
  }
});

await mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
logger.info('✅ Connected to MongoDB');

let redisClient = null;
if (process.env.REDIS_URL) {
  const Redis = (await import('ioredis')).default;
  redisClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  redisClient.on('error', (err) => logger.warn('Redis error:', err.message));
  client.redis = redisClient;
  logger.info('✅ Redis connected');
} else {
  client.redis = null;
  logger.info('ℹ️ Redis not configured — using in-memory fallbacks');
}

// === RECURSIVE COMMAND LOADER ===
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
          logger.debug(`Loaded command: ${command.data.name}`);
        } else {
          logger.warn(`Skipped invalid command: ${path}`);
        }
      } catch (err) {
        logger.error(`Failed to load command ${path}:`, {
          message: err.message,
          stack: err.stack,
          code: err.code
        });
      }
    }
  }
  return commands;
};

const allCommands = await loadCommandsRecursively(join(PROJECT_ROOT, 'commands'));
for (const cmd of allCommands) {
  client.commands.set(cmd.data.name, cmd);
}
logger.info(`✅ Loaded ${allCommands.length} commands`);

// === REGISTER COMMANDS GLOBALLY ON READY ===
client.once('ready', async () => {
  try {
    const commandData = allCommands.map(cmd => cmd.data.toJSON());
    logger.info(`📡 Registering ${commandData.length} global commands...`);
    await client.application.commands.set(commandData);
    logger.info(`✅ Global commands registered. May take up to 1 hour to appear.`);
  } catch (err) {
    logger.error('❌ Failed to register global commands:', err);
  }
});

// Load events
const loadEvents = async () => {
  const eventsPath = join(__dirname, 'events');
  const eventFiles = await fs.readdir(eventsPath, { withFileTypes: true });
  for (const file of eventFiles) {
    if (file.isFile() && file.name.endsWith('.js')) {
      const filePath = join(eventsPath, file.name);
      const event = await import(`file://${filePath}`);
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      logger.debug(`Loaded event: ${event.name}`);
    }
  }
};
await loadEvents();

initAudit(client);
initRateLimiter(client);
initSecurity(client);

// === DASHBOARD HTTP SERVER ===
const app = express();
const PORT = process.env.PORT || 10000;

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
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

function ensureAuth(req, res, next) {
  if (!req.session.discordUser) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

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
  if (!code) return res.status(400).send('❌ No code provided.');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.REDIRECT_URI
      })
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error || 'Token exchange failed');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    req.session.discordUser = await userRes.json();
    req.session.userGuilds = await guildsRes.json();

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
    console.error('OAuth Error:', err.message);
    res.status(500).send('❌ Login failed. Please try again.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/api/user', ensureAuth, (req, res) => {
  const { id, username, avatar } = req.session.discordUser;
  res.json({
    user: {
      id,
      username,
      avatar: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` : null
    }
  });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const manageable = (req.session.userGuilds || [])
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n)
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null
    }));
  res.json({ servers: manageable });
});

app.post('/api/ticket/deploy', ensureAuth, (req, res) => {
  console.log('TICKET DEPLOY:', req.body);
  res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'success.html')));
app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🌐 HTTP server listening on http://0.0.0.0:${PORT}`);
});

// === START BOT ===
try {
  await client.login(process.env.DISCORD_TOKEN);
  logger.info(`✅ Strive V2 online as ${client.user.tag}`);
  logger.info(`🌍 Serving ${client.guilds.cache.size.toLocaleString()} guilds`);
} catch (err) {
  logger.fatal('❌ Failed to log in:', err.message);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.warn(`Received ${signal} — shutting down...`);
  try {
    await client.destroy();
    if (redisClient) await redisClient.quit();
    await mongoose.disconnect();
  } catch (err) {
    logger.error('Shutdown error:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
