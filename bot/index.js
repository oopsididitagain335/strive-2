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

// Shared logger from root /utils
import { logger } from '../utils/logger.js';
import { initAudit } from './utils/audit.js';
import { initRateLimiter } from './utils/rateLimiter.js';
import { initSecurity } from './security/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Validate critical environment variables
const requiredEnv = ['DISCORD_TOKEN', 'MONGO_URI', 'CLIENT_ID', 'ADMIN_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.fatal(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// === DISCORD BOT SETUP ===
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

// Global error handling (stay online!)
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

// MongoDB connection
await mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
logger.info('✅ Connected to MongoDB');

// Optional Redis
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

// Recursive loader for commands/events
const loadDirectory = async (dirPath, initFn = null) => {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const dirent of files) {
      const fullPath = join(dirPath, dirent.name);
      if (dirent.isDirectory()) {
        await loadDirectory(fullPath, initFn);
      } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
        if (initFn) await initFn(fullPath);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error(`Failed to load directory ${dirPath}:`, err.message);
    }
  }
};

// Load commands from root /commands
await loadDirectory(join(PROJECT_ROOT, 'commands'), async (filePath) => {
  try {
    const command = await import(`file://${filePath}`);
    if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      logger.debug(`Loaded command: ${command.data.name}`);
    } else {
      logger.warn(`Skipped invalid command: ${filePath}`);
    }
  } catch (err) {
    logger.error(`Failed to load command ${filePath}:`, {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
  }
});

// Load events from /bot/events
await loadDirectory(join(__dirname, 'events'), async (filePath) => {
  try {
    const event = await import(`file://${filePath}`);
    if (event.name && typeof event.execute === 'function') {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      logger.debug(`Loaded event: ${event.name}`);
    } else {
      logger.warn(`Skipped invalid event: ${filePath}`);
    }
  } catch (err) {
    logger.error(`Failed to load event ${filePath}:`, {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
  }
});

// Initialize bot subsystems
initAudit(client);
initRateLimiter(client);
initSecurity(client);

logger.info(`✅ Loaded ${client.commands.size} commands`);

// === DASHBOARD HTTP SERVER (Render Web Service) ===
const app = express();
const PORT = process.env.PORT || 10000;

// Security & static files
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https://cdn.discordapp.com", "https://top.gg", "data:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  }
}));

app.use(express.static(join(PROJECT_ROOT, 'dashboard', 'public'), {
  maxAge: '1d'
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session (shared with bot via MongoDB)
app.use(session({
  secret: process.env.SESSION_KEY || 'strive_secure_session_2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collection: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// Auth middleware
function ensureAuth(req, res, next) {
  if (!req.session.discordUser) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

// OAuth2 routes
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  const state = Buffer.from(redirect).toString('base64');
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
  if (!code) return res.status(400).send('❌ No authorization code provided.');

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
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error);

    const [userRes, guildsRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      }),
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
    ]);

    req.session.discordUser = await userRes.json();
    req.session.userGuilds = await guildsRes.json();

    const redirect = state ? Buffer.from(state, 'base64').toString() : '/dashboard';
    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth Error:', err.message);
    res.status(500).send('❌ Login failed. Please try again.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// API routes
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
  console.log('TICKET DEPLOY REQUEST:', req.body);
  res.json({ success: true });
});

// Public routes
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'success.html')));

// Health check (required by Render)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    bot: client.readyAt ? 'online' : 'starting',
    timestamp: new Date().toISOString()
  });
});

// Start HTTP server on 0.0.0.0:PORT
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🌐 Dashboard HTTP server listening on http://0.0.0.0:${PORT}`);
});

// === START DISCORD BOT ===
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
  logger.warn(`Received ${signal} — shutting down gracefully...`);
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
