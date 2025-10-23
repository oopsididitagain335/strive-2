// /dashboard/server.js
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session (shared with bot via MongoDB)
app.use(session({
  secret: process.env.SESSION_KEY || 'strive_secure_2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collection: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
  }
}));

// API Routes
import './api/user.js';
import './api/servers.js';
import './api/ticket.js';
import './api/subscription.js';

// Mount API
app.use('/api', (req, res, next) => {
  if (!req.session.discordUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}, (req, res, next) => {
  // Placeholder — real routes are in /api/*.js via app.use in each
  next();
});

// OAuth2 Routes
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
    const data = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(data.error);

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${data.access_token}` }
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${data.access_token}` }
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

// Public Pages
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Protected Pages
const ensureAuth = (req, res, next) => {
  if (!req.session.discordUser) return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  next();
};

app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(__dirname, 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(__dirname, 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(__dirname, 'public', 'success.html')));

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Strive Dashboard running on port ${PORT}`);
});
