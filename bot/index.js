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
import { logger } from '../utils/logger.js';
import { encryptJSON, decryptJSON } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User],
  allowedMentions: { parse: [], repliedUser: false },
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
        }
      } catch (err) {
        console.error(`Failed to load command ${path}:`, err);
      }
    }
  }
  return commands;
};

const allCommands = await loadCommandsRecursively(join(PROJECT_ROOT, 'commands'));
for (const cmd of allCommands) client.commands.set(cmd.data.name, cmd);
logger.info(`✅ Loaded ${allCommands.length} commands`);

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
  const eventsPath = join(__dirname, 'events');
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

// === BASIC ROUTES ===
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html')));

// === SETUP INFO API ===
app.get('/api/setup-info', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    // decryptJSON() should return something like: { guildId: '123456789012345678', timestamp: ... }
    const data = decryptJSON(token, process.env.ENCRYPTION_SECRET);
    if (!data.guildId) return res.status(400).json({ error: 'Invalid token payload' });

    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found or bot not in guild' });

    return res.json({
      guild: { id: guild.id, name: guild.name },
      bot: { id: client.user.id, tag: client.user.tag },
    });
  } catch (err) {
    console.error('Failed to decode setup token:', err);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

// === HEALTH ===
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// === START SERVER ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Dashboard running at ${BASE_URL}`);
});

// === DISCORD LOGIN ===
try {
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`✅ Bot connected as ${client.user.tag}`);
} catch (err) {
  console.error('❌ Failed to log in to Discord:', err);
  process.exit(1);
}

// === GRACEFUL SHUTDOWN ===
async function shutdown(signal) {
  console.warn(`Received ${signal} — shutting down...`);
  try {
    await client.destroy();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Shutdown error:', err);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
