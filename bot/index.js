// /bot/index.js
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';

// --- Utils & Security (per your structure) ---
import { logger } from './utils/logger.js';
import { initAudit } from './utils/audit.js';
import { initRateLimiter } from './utils/rateLimiter.js';
import { initSecurity } from './security/index.js';
import { initTickets } from './tickets/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Validate critical environment variables ---
const requiredEnv = ['DISCORD_TOKEN', 'MONGO_URI', 'CLIENT_ID', 'ADMIN_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.fatal(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,       // Music
    GatewayIntentBits.GuildPresences,         // Automation
    GatewayIntentBits.GuildInvites,           // Security
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction],
  allowedMentions: { parse: [], repliedUser: false },
  rest: { timeout: 15_000 },
  shards: 'auto',
});

client.commands = new Collection();
client.cooldowns = new Collection();

// --- Global Error Handling (Stay Online!) ---
process.on('unhandledRejection', (reason) => {
  logger.warn('⚠️ Unhandled Rejection:', reason?.message || String(reason));
});

process.on('uncaughtException', (err) => {
  logger.error('🔥 Uncaught Exception:', {
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 3).join('\n'),
  });
  // Only exit on auth failure
  if (err.message?.includes('TOKEN_INVALID') || err.message?.includes('401')) {
    logger.fatal('Bot token invalid — shutting down.');
    process.exit(1);
  }
  // Otherwise: recover and stay online
});

// --- Database Connections ---
let redisClient = null;

// MongoDB
await mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
logger.info('✅ Connected to MongoDB');

// Optional Redis (for rate limiting, caching)
if (process.env.REDIS_URL) {
  const Redis = await import('ioredis').then(m => m.default);
  redisClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  redisClient.on('error', (err) => logger.warn('Redis error:', err.message));
  client.redis = redisClient;
  logger.info('✅ Redis connected (optional)');
} else {
  client.redis = null;
  logger.info('ℹ️ Redis not configured — using in-memory fallbacks');
}

// --- Auto-Import ALL Modules (Recursive) ---

const loadDirectory = async (dirPath, initFn = null) => {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const dirent of files) {
      const fullPath = join(dirPath, dirent.name);
      if (dirent.isDirectory()) {
        await loadDirectory(fullPath, initFn); // recurse
      } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
        if (initFn) {
          await initFn(fullPath);
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.error(`Failed to load directory ${dirPath}:`, err.message);
    }
  }
};

// Load Commands (supports nested folders like /commands/tickets/create.js)
await loadDirectory(join(__dirname, 'commands'), async (filePath) => {
  const command = await import(filePath);
  if (command.data && typeof command.execute === 'function') {
    client.commands.set(command.data.name, command);
    logger.debug(`Loaded command: ${command.data.name}`);
  } else {
    logger.warn(`Skipped invalid command: ${filePath}`);
  }
});

// Load Events
await loadDirectory(join(__dirname, 'events'), async (filePath) => {
  const event = await import(filePath);
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
});

// Initialize subsystems
initAudit(client);
initRateLimiter(client);
initSecurity(client);
initTickets(client); // even if tickets are command-based, this can register listeners or helpers

logger.info(`✅ Loaded ${client.commands.size} commands and all events`);

// --- Graceful Shutdown ---
const shutdown = async (signal) => {
  logger.warn(`Received ${signal} — shutting down gracefully...`);
  try {
    await client.destroy();
    if (redisClient) await redisClient.quit();
    await mongoose.disconnect();
  } catch (err) {
    logger.error('Shutdown error:', err);
  }
  logger.info('Bot offline.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Login ---
try {
  await client.login(process.env.DISCORD_TOKEN);
  logger.info(`✅ Strive V2 online as ${client.user.tag}`);
  logger.info(`🌍 Serving ${client.guilds.cache.size.toLocaleString()} guilds`);
} catch (err) {
  logger.fatal('❌ Failed to log in:', err.message);
  process.exit(1);
}
