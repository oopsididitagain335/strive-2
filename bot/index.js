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
const REQUIRE_DASHBOARD_LOGIN = process.env.REQUIRE_DASHBOARD_LOGIN === 'true';

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
  console.error('❌ MongoDB connection failed', err);
  process.exit(1);
}

// === OPTIONAL REDIS ===
if (process.env.REDIS_URL) {
  try {
    const Redis = (await import('ioredis')).default;
    const redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    redisClient.on('error', (err) => logger.warn('Redis error:', err.message));
    client.redis = redisClient;
    logger.info('✅ Connected to Redis');
  } catch (err) {
    logger.warn('⚠️ Failed to init Redis:', err.message);
    client.redis = null;
  }
} else {
  client.redis = null;
  logger.info('ℹ️ Redis not configured — using in-memory fallback');
}

// === LOAD COMMANDS ===
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
        }
      } catch (err) {
        logger.error(`Failed to load command ${path}:`, err);
      }
    }
  }
  return commands;
};
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
    logger.warn('⚠️ Failed to register global commands:', err.message);
  }
});

// === LOAD EVENTS ===
try {
  const eventsPath = join(PROJECT_ROOT, 'events');
  const eventFiles = await fs.readdir(eventsPath, { withFileTypes: true });
  for (const file of eventFiles) {
    if (file.isFile() && file.name.endsWith('.js')) {
      const event = await import(`file://${join(eventsPath, file.name)}`);
      if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
      else client.on(event.name, (...args) => event.execute(...args, client));
      logger.debug(`Loaded event: ${event.name}`);
    }
  }
} catch (err) {
  logger.warn('No events directory found or failed to load events:', err.message);
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
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 14*24*60*60*1000 }
}));

function ensureAuth(req, res, next) {
  if (!req.session?.discordUser) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  next();
}

// === OAUTH ===
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
        redirect_uri: process.env.REDIRECT_URI
      }),
    });
    const tokens = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    req.session.discordUser = await userRes.json();
    req.session.userGuilds = await guildsRes.json();
    let redirectUrl = '/dashboard';
    if (state) {
      try { redirectUrl = decodeURIComponent(state); if (!redirectUrl.startsWith('/')) redirectUrl = '/dashboard'; } catch { redirectUrl = '/dashboard'; }
    }
    res.redirect(redirectUrl);
  } catch (err) {
    logger.error('OAuth callback error', err);
    res.status(500).send('❌ Login failed.');
  }
});

app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// === API ===
app.get('/api/user', ensureAuth, (req, res) => {
  const { id, username, avatar } = req.session.discordUser;
  res.json({ user: { id, username, avatar: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null } });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const servers = (req.session.userGuilds || []).filter(g => (BigInt(g.permissions) & BigInt(8)) !== 0n);
  res.json({ servers });
});

app.get('/api/bot-status', (req, res) => {
  res.json({ connected: !!client.user, bot: client.user ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() } : null, guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name })) });
});

// === Ticket token verification / deploy endpoints ===
app.get('/api/ticket/token', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ valid: false, message: 'No token' });
  const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
  if (!payload) return res.status(400).json({ valid: false, message: 'Invalid token' });
  if (payload.expiresAt && Date.now() > payload.expiresAt) return res.status(400).json({ valid: false, message: 'Expired' });
  const guild = client.guilds.cache.get(payload.guildId);
  if (!guild) return res.status(400).json({ valid: false, message: 'Bot not in guild' });
  res.json({ valid: true, guildId: payload.guildId, guildName: payload.guildName || guild.name, userId: payload.userId });
});

app.post('/api/ticket/deploy', async (req, res) => {
  const { token, title, description, color, channelId, buttons } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'No token' });
  const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
  if (!payload) return res.status(400).json({ success: false, message: 'Invalid token' });
  if (payload.expiresAt && Date.now() > payload.expiresAt) return res.status(400).json({ success: false, message: 'Expired' });

  if (REQUIRE_DASHBOARD_LOGIN && (!req.session?.discordUser || String(req.session.discordUser.id) !== String(payload.userId))) {
    return res.status(403).json({ success: false, message: 'Not token owner' });
  }

  const guild = await client.guilds.fetch(payload.guildId).catch(() => null);
  if (!guild) return res.status(400).json({ success: false, message: 'Bot not in guild' });

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return res.status(400).json({ success: false, message: 'Invalid channel' });

  const embed = new EmbedBuilder().setTitle(title || 'Support').setDescription(description || '').setColor(color || '#2f3136').setTimestamp();
  const row = new ActionRowBuilder();
  (Array.isArray(buttons) ? buttons.slice(0, 5) : []).forEach((b, i) => {
    const styleMap = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger };
    const style = styleMap[(b.style || 'PRIMARY').toUpperCase()] || ButtonStyle.Primary;
    row.addComponents(new ButtonBuilder().setCustomId(`ticket:${token.slice(0,16)}:${i}`).setLabel(b.label || `Button ${i+1}`).setStyle(style));
  });
  await channel.send({ embeds: [embed], components: row.components.length ? [row] : [] });
  res.json({ success: true });
});

// === Serve dashboard HTML ===
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/setup.html', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html')));

// === START SERVER & BOT ===
app.listen(PORT, '0.0.0.0', () => logger.info(`🌐 Dashboard running at ${BASE_URL}`));
try { await client.login(process.env.DISCORD_TOKEN); } catch (err) { console.error('❌ Discord login failed', err); process.exit(1); }

// === GRACEFUL SHUTDOWN ===
async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  await client.destroy();
  if (client.redis) await client.redis.quit();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
