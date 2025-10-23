// /dashboard/server.js
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Store (shared with bot)
app.use(session({
  secret: process.env.SESSION_KEY || 'strive_secure_session_2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, collection: 'sessions' }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// === OAuth2 Routes ===
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
  if (!code) return res.status(400).send('❌ No code provided.');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.REDIRECT_URI
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error);

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    req.session.discordUser = await userRes.json();
    req.session.userGuilds = await guildsRes.json();

    const redirect = state ? Buffer.from(state, 'base64').toString() : '/dashboard';
    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).send('Login failed. Try again.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// === API Routes ===
app.get('/api/user', (req, res) => {
  if (!req.session.discordUser) return res.status(401).json({ error: 'Unauthorized' });
  const user = req.session.discordUser;
  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null
    }
  });
});

app.get('/api/servers', (req, res) => {
  if (!req.session.userGuilds) return res.status(401).json({ error: 'Unauthorized' });

  const manageable = req.session.userGuilds
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n)
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
        : null
    }));

  res.json({ servers: manageable });
});

app.post('/api/ticket/deploy', async (req, res) => {
  // In production: forward to bot via internal API or Redis
  console.log('TICKET DEPLOY REQUEST:', req.body);
  res.json({ success: true });
});

// === Public Routes ===
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(__dirname, 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(__dirname, 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(__dirname, 'public', 'success.html')));

// === Middleware: Require Auth ===
function ensureAuth(req, res, next) {
  if (!req.session.discordUser) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// === Health Check ===
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// === Start Server ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Strive Dashboard running on port ${PORT}`);
});
