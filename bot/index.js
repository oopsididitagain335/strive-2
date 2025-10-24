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
import { encryptGuildId, decryptGuildId } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// === ENV CHECK ===
const requiredEnv = ['DISCORD_TOKEN', 'MONGO_URI', 'CLIENT_ID', 'CLIENT_SECRET', 'SESSION_KEY', 'REDIRECT_URI'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.fatal(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// === DISCORD CLIENT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});
client.commands = new Collection();

// === DATABASE ===
await mongoose.connect(process.env.MONGO_URI);
logger.info('✅ Connected to MongoDB');

// === LOAD COMMANDS ===
async function loadCommands(dir) {
  const commands = [];
  const files = await fs.readdir(dir, { withFileTypes: true });
  for (const file of files) {
    const path = join(dir, file.name);
    if (file.isDirectory()) commands.push(...(await loadCommands(path)));
    else if (file.name.endsWith('.js')) {
      const cmd = await import(`file://${path}`);
      if (cmd.data && typeof cmd.execute === 'function') commands.push(cmd);
    }
  }
  return commands;
}
const commands = await loadCommands(join(PROJECT_ROOT, 'commands'));
for (const c of commands) client.commands.set(c.data.name, c);
logger.info(`✅ Loaded ${commands.length} commands`);

// === DISCORD EVENTS ===
client.once('ready', () => {
  logger.info(`🤖 Logged in as ${client.user.tag}`);
});

// === EXPRESS DASHBOARD ===
const app = express();
const PORT = process.env.PORT || 10000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(PROJECT_ROOT, 'dashboard', 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { secure: false },
}));

function ensureAuth(req, res, next) {
  if (!req.session.discordUser) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

// === OAUTH LOGIN ===
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', redirect);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code.');

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

    const token = await tokenRes.json();
    if (!token.access_token) throw new Error('Token exchange failed');

    const [userRes, guildRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } }),
      fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${token.access_token}` } }),
    ]);

    req.session.discordUser = await userRes.json();
    req.session.userGuilds = await guildRes.json();

    res.redirect(state || '/dashboard');
  } catch (err) {
    logger.error('OAuth Error:', err);
    res.status(500).send('Login failed.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// === API ROUTES ===
app.get('/api/user', ensureAuth, (req, res) => {
  const { id, username, avatar } = req.session.discordUser;
  res.json({
    id,
    username,
    avatar: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null,
  });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const servers = (req.session.userGuilds || []).filter(g => (BigInt(g.permissions) & BigInt(8)) !== 0n);
  res.json({ servers });
});

app.get('/api/setup/verify', ensureAuth, async (req, res) => {
  const token = req.query.token;
  const guildId = decryptGuildId(token, process.env.SESSION_KEY);
  if (!guildId) return res.status(400).json({ error: 'Invalid token' });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Guild not found or bot not in guild' });

  res.json({
    guild: { id: guild.id, name: guild.name, icon: guild.iconURL() },
    user: req.session.discordUser,
  });
});

app.get('/', (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'dashboard.html')));
app.get('/setup.html', ensureAuth, (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', 'setup.html')));

// === START ===
app.listen(PORT, '0.0.0.0', () => logger.info(`🌐 Dashboard running at http://0.0.0.0:${PORT}`));

try {
  await client.login(process.env.DISCORD_TOKEN);
  logger.info(`✅ Bot connected as ${client.user.tag}`);
} catch (err) {
  logger.fatal('❌ Discord login failed: ' + err.message);
  process.exit(1);
}
