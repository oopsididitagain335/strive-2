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

// Security
app.use(helmet({
  contentSecurityPolicy: false, // Disable for dev; tighten in prod
}));

// Static files
app.use(express.static(join(__dirname, 'public')));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// === SESSION SETUP (CRITICAL) ===
if (!process.env.SESSION_KEY) {
  console.error('❌ SESSION_KEY is required');
  process.exit(1);
}

app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collection: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true only on HTTPS (Render sets this)
    httpOnly: true,
    sameSite: 'lax', // ✅ MUST be 'lax' to allow OAuth redirect from Discord
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

// === LOGIN ===
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  // Use simple URL encoding (not base64) to avoid length/encoding issues
  const state = encodeURIComponent(redirect);
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.REDIRECT_URI); // Must match Discord exactly
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// === CALLBACK (FIXED) ===
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    console.error('No code in callback');
    return res.status(400).send('Authorization failed: no code received.');
  }

  try {
    // Step 1: Exchange code for token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.REDIRECT_URI // Must match exactly
      })
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', tokens);
      return res.status(400).send('Authorization failed: invalid token exchange.');
    }

    // Step 2: Fetch user + guilds
    const [userRes, guildsRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      }),
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
    ]);

    if (!userRes.ok || !guildsRes.ok) {
      console.error('Failed to fetch user/guilds');
      return res.status(400).send('Authorization failed: could not fetch user data.');
    }

    const user = await userRes.json();
    const guilds = await guildsRes.json();

    // Save to session
    req.session.discordUser = user;
    req.session.userGuilds = guilds;

    // Step 3: Redirect safely
    let redirect = '/dashboard';
    if (state) {
      try {
        redirect = decodeURIComponent(state);
        // Prevent open redirect
        if (!redirect.startsWith('/')) redirect = '/dashboard';
      } catch (e) {
        redirect = '/dashboard';
      }
    }

    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.status(500).send('Internal error during login. Please try again.');
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// API
app.get('/api/user', ensureAuth, (req, res) => {
  res.json({ user: req.session.discordUser });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const manageable = (req.session.userGuilds || [])
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n);
  res.json({ servers: manageable });
});

// Public routes
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(__dirname, 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(__dirname, 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(__dirname, 'public', 'success.html')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Dashboard running on http://0.0.0.0:${PORT}`);
});
