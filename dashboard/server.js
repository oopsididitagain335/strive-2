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

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
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

// OAuth2 Routes
app.get('/login', (req, res) => {
  const state = Buffer.from(req.query.redirect || '/dashboard').toString('base64');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No code');

  try {
    // Token exchange
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

    // Fetch user + guilds
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();
    const guilds = await guildsRes.json();

    req.session.discordUser = user;
    req.session.userGuilds = guilds;

    const redirect = state ? Buffer.from(state, 'base64').toString() : '/dashboard';
    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).send('Login failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Middleware: require auth
const ensureAuth = (req, res, next) => {
  if (!req.session.discordUser) return res.redirect('/login');
  next();
};

// Public Routes
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Dashboard
app.get('/dashboard', ensureAuth, (req, res) => {
  res.sendFile(join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/user', ensureAuth, (req, res) => {
  res.json({ user: req.session.discordUser });
});

// Ticket Panel Setup
app.get('/setup.html', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('No token');
  res.sendFile(join(__dirname, 'public', 'setup.html'));
});

app.post('/api/ticket/deploy', express.json(), async (req, res) => {
  const { token, title, description, color, buttons } = req.body;

  // Forward to bot via internal API or shared memory
  // In real app: use Redis or HTTP to bot worker
  // For now: simulate success
  console.log('Deploy ticket panel:', { token, title });
  res.json({ success: true });
});

// Premium
app.get('/premium', (req, res) => res.sendFile(join(__dirname, 'public', 'premium.html')));
app.get('/success', (req, res) => res.sendFile(join(__dirname, 'public', 'success.html')));

// Verification
app.get('/verify', (req, res) => res.sendFile(join(__dirname, 'public', 'verify.html')));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
});
