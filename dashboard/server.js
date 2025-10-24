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

// Validate critical env vars
const required = ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI', 'MONGO_URI', 'SESSION_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

// Security
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Static files
app.use(express.static(join(__dirname, 'public')));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_KEY,
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

// Login
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

// Callback
app.get('/auth/callback', async (req, res) => {
  console.log('🔍 OAuth callback triggered. Query:', req.query);

  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('❌ Discord OAuth error:', error, error_description);
    return res.status(400).send(`Authorization failed: ${error} - ${error_description}`);
  }

  if (!code) {
    console.error('❌ No code received. Full query:', req.query);
    return res.status(400).send('Authorization failed: no code received.');
  }

  try {
    // Exchange code for token
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
    if (!tokenRes.ok) {
      console.error('❌ Token exchange failed:', tokens);
      return res.status(400).send('Authorization failed: invalid token exchange.');
    }

    // Fetch user
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    if (!userRes.ok) {
      console.error('❌ Failed to fetch user:', user);
      return res.status(400).send('Authorization failed: could not fetch user.');
    }

    // Fetch guilds
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const guilds = await guildsRes.json();

    if (!guildsRes.ok) {
      console.error('❌ Failed to fetch guilds:', guilds);
      return res.status(400).send('Authorization failed: could not fetch guilds.');
    }

    // Save session
    req.session.discordUser = user;
    req.session.userGuilds = guilds;
    console.log('✅ User logged in:', user.username, 'with', guilds.length, 'guilds');

    // Save session explicitly before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).send('Internal error: could not save session.');
      }

      // Redirect
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
    });
  } catch (err) {
    console.error('🔥 Callback error:', err.message, err.stack);
    res.status(500).send('Internal error. Please try again.');
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
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

// Routes
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'dashboard.html')));
app.get('/premium', ensureAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'premium.html')));
app.get('/setup.html', (req, res) => res.sendFile(join(__dirname, 'public', 'setup.html')));
app.get('/verify', (req, res) => res.sendFile(join(__dirname, 'public', 'verify.html')));
app.get('/success', (req, res) => res.sendFile(join(__dirname, 'public', 'success.html')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', time: new Date().toISOString() });
});

// Start server on 0.0.0.0:PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Dashboard running on http://0.0.0.0:${PORT}`);
});
