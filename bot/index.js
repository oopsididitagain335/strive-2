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
    logger.fatal(`❌ Missing required environment variable: ${key}`);
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

// === MONGOOSE ===
try {
  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  logger.info('✅ Connected to MongoDB');
} catch (err) {
  logger.fatal('❌ Failed to connect to MongoDB:', err);
  process.exit(1);
}

// === OPTIONAL REDIS (if present) ===
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
  logger.info('ℹ️ Redis not configured — using in-memory fallbacks');
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
          logger.debug(`Loaded command: ${command.data.name}`);
        } else {
          logger.warn(`Skipped invalid command file: ${path}`);
        }
      } catch (err) {
        logger.error(`Failed to load command ${path}:`, { message: err.message, stack: err.stack });
      }
    }
  }
  return commands;
};

// load commands folder (adjust path if different)
const allCommands = await loadCommandsRecursively(join(PROJECT_ROOT, 'commands'));
for (const cmd of allCommands) client.commands.set(cmd.data.name, cmd);
logger.info(`✅ Loaded ${allCommands.length} commands`);

// === REGISTER GLOBAL COMMANDS ON READY (optional) ===
client.once('ready', async () => {
  logger.info(`🤖 Logged in as ${client.user.tag} (${client.user.id})`);
  try {
    const commandData = allCommands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commandData);
    logger.info(`📡 Registered ${commandData.length} global commands (may take up to ~1hr to propagate).`);
  } catch (err) {
    logger.warn('⚠️ Failed to register global commands:', err?.message ?? err);
  }
});

// === LOAD EVENTS ===
try {
  const eventsPath = join(__dirname, 'events'); // Use __dirname directly since events is in same dir
  logger.debug(`Attempting to load events from: ${eventsPath}`);
  try {
    await fs.access(eventsPath); // Check if directory exists
    const eventFiles = await fs.readdir(eventsPath, { withFileTypes: true });
    logger.debug(`Found ${eventFiles.length} items in events directory`);
    
    for (const file of eventFiles) {
      if (file.isFile() && file.name.endsWith('.js')) {
        const filePath = join(eventsPath, file.name);
        try {
          const event = await import(`file://${filePath}`);
          const eventModule = event.default || event; // Handle ES module default export
          if (!eventModule.name || typeof eventModule.execute !== 'function') {
            logger.warn(`Skipped invalid event file: ${file.name} (missing name or execute function)`);
            continue;
          }
          if (eventModule.once) {
            client.once(eventModule.name, (...args) => eventModule.execute(...args, client));
          } else {
            client.on(eventModule.name, (...args) => eventModule.execute(...args, client));
          }
          logger.debug(`Loaded event: ${eventModule.name} from ${file.name}`);
        } catch (err) {
          logger.error(`Failed to load event file ${file.name}:`, err.message);
        }
      }
    }
    logger.info(`✅ Loaded ${client.listenerCount('ready') + client.listenerCount('messageCreate') + client.listenerCount('interactionCreate')} event listeners`);
  } catch (err) {
    logger.warn('⚠️ Events directory not found or inaccessible:', err.message);
  }
} catch (err) {
  logger.error('Unexpected error loading events:', err.message);
}

// === Express dashboard + API server ===
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
    logger.error('OAuth Callback Error:', err?.message ?? err);
    res.status(500).send('❌ Login failed (see server logs).');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// === API: basic user / servers ===
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

// === API: bot status ===
app.get('/api/bot-status', (req, res) => {
  res.json({
    connected: !!client.user,
    bot: client.user ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() } : null,
    guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name })),
  });
});

// === API: token verification (decrypt & return snapshot) ===
app.get('/api/ticket/token', (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ valid: false, message: 'No token provided' });

    const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
    if (!payload) return res.status(400).json({ valid: false, message: 'Invalid token' });

    if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) {
      return res.status(400).json({ valid: false, message: 'Token expired' });
    }

    // Confirm the bot is in that guild
    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return res.status(400).json({ valid: false, message: 'Bot not a member of guild' });

    // Safe response: don't expose secret fields, only safe snapshot
    return res.json({
      valid: true,
      guildId: payload.guildId,
      guildName: payload.guildName || guild.name,
      userId: payload.userId,
      channels: payload.channels || [], // snapshot captured when token created
      bot: client.user ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() } : null,
    });
  } catch (err) {
    logger.warn('Token verify error:', err?.message ?? err);
    return res.status(500).json({ valid: false, message: 'Server error verifying token' });
  }
});

// === API: deploy panel (decrypt & post to channel) ===
app.post('/api/ticket/deploy', async (req, res) => {
  try {
    const { token, title, description, color, channelId, buttons } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'No token provided' });

    const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
    if (!payload) return res.status(400).json({ success: false, message: 'Invalid token' });
    if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) {
      return res.status(400).json({ success: false, message: 'Token expired' });
    }

    // Optional: require the user to be logged in and match the token's creator
    if (REQUIRE_DASHBOARD_LOGIN) {
      if (!req.session?.discordUser) {
        return res.status(401).json({ success: false, message: 'Login required to deploy' });
      }
      if (String(req.session.discordUser.id) !== String(payload.userId)) {
        return res.status(403).json({ success: false, message: 'You are not the token owner' });
      }
    }

    // Fetch guild & channel
    const guild = await client.guilds.fetch(payload.guildId).catch(() => null);
    if (!guild) return res.status(400).json({ success: false, message: 'Bot not in target guild' });

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.status(400).json({ success: false, message: 'Channel not found' });
    if (channel.type !== ChannelType.GuildText) {
      return res.status(400).json({ success: false, message: 'Channel is not a text channel' });
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(title || 'Support')
      .setDescription(description || '')
      .setColor(color || '#2f3136')
      .setTimestamp();

    // Build buttons (max 5)
    const row = new ActionRowBuilder();
    const safeButtons = Array.isArray(buttons) ? buttons.slice(0, 5) : [];
    for (let i = 0; i < safeButtons.length; i++) {
      const b = safeButtons[i] || {};
      const label = String(b.label || `Open ${i + 1}`).slice(0, 80);
      const styleKey = String(b.style || 'PRIMARY').toUpperCase();
      let style = ButtonStyle.Primary;
      if (styleKey === 'SECONDARY') style = ButtonStyle.Secondary;
      if (styleKey === 'SUCCESS') style = ButtonStyle.Success;
      if (styleKey === 'DANGER') style = ButtonStyle.Danger;
      const tokenShort = (token || '').slice(0, 16).replace(/[:/+=]/g, '');
      const customId = `ticket:${tokenShort}:${i}`;
      const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
      row.addComponents(button);
    }

    // Send message to channel
    const components = row.components.length ? [row] : [];
    await channel.send({ embeds: [embed], components });

    logger.info(`✅ Deployed ticket panel to ${guild.id}/${channel.id} by token owner ${payload.userId}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Deploy error:', err?.message ?? err, { stack: err?.stack });
    return res.status(500).json({ success: false, message: 'Server error during deploy' });
  }
});

// === Serve setup HTML directly (dashboard/public should include setup.html) ===
app.get('/setup.html', ensureAuth, (req, res) => {
  res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html'));
});

// === other dashboard routes (optional) ===
app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/verify', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'success.html')));
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// start http server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🌐 Dashboard running at ${BASE_URL}`);
});

// start discord client
try {
  await client.login(process.env.DISCORD_TOKEN);
  logger.info(`✅ Bot connected as ${client.user.tag} (${client.user.id}) — serving ${client.guilds.cache.size} cached guild(s)`);
} catch (err) {
  logger.fatal('❌ Failed to log in to Discord:', err?.message || err);
  process.exit(1);
}

// graceful shutdown
async function shutdown(signal) {
  logger.warn(`Received ${signal} — shutting down...`);
  try {
    await client.destroy();
    if (client.redis) await client.redis.quit();
    await mongoose.disconnect();
  } catch (err) {
    logger.error('Error during shutdown:', err?.message ?? err);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
