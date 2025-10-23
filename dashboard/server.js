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

// === Security & Middleware ===
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https://cdn.discordapp.com", "https://top.gg", "data:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://discord.com", "https://api.stripe.com"]
    }
  }
}));

app.use(express.static(join(__dirname, 'public'), {
  maxAge: '1d'
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// === Session Management (Shared with Bot) ===
app.use(session({
  secret: process.env.SESSION_KEY || 'strive_secure_session_2025',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collection: 'sessions',
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// === Middleware: Require Auth ===
function requireAuth(req, res, next) {
  if (!req.session.discordUser) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  res.locals.user = req.session.discordUser;
  next();
}

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
  if (!code) return res.status(400).send('❌ Authorization code missing.');

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
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error);

    // Fetch user + guilds
    const [userRes, guildsRes] = await Promise.all([
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      }),
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
    ]);

    const user = await userRes.json();
    const guilds = await guildsRes.json();

    req.session.discordUser = user;
    req.session.userGuilds = guilds;

    const redirect = state ? Buffer.from(state, 'base64').toString() : '/dashboard';
    res.redirect(redirect);
  } catch (err) {
    console.error('OAuth Error:', err.message);
    res.status(500).send('❌ Login failed. Please try again.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// === API Routes ===
app.get('/api/user', requireAuth, (req, res) => {
  const { id, username, discriminator, avatar } = req.session.discordUser;
  res.json({
    user: {
      id,
      username,
      discriminator,
      avatar: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128` : null
    }
  });
});

app.get('/api/servers', requireAuth, (req, res) => {
  const manageable = (req.session.userGuilds || [])
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n)
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
      memberCount: 'Unknown'
    }));
  res.json({ servers: manageable });
});

app.post('/api/ticket/deploy', requireAuth, async (req, res) => {
  const { token, title, description, color, buttons } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid token' });
  }

  // In production: forward to bot via internal API or Redis
  console.log('TICKET DEPLOY REQUEST:', { token, title, guildId: req.body.guildId });

  // Simulate success
  res.json({ success: true });
});

// === Public Routes ===
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(join(__dirname, 'public', 'dashboard.html'));
});

app.get('/premium', requireAuth, (req, res) => {
  res.sendFile(join(__dirname, 'public', 'premium.html'));
});

app.get('/setup.html', (req, res) => {
  // Validate token server-side if needed
  res.sendFile(join(__dirname, 'public', 'setup.html'));
});

app.get('/verify', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'verify.html'));
});

app.get('/success', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'success.html'));
});

// === Health Check (Required by Render) ===
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'strive-dashboard'
  });
});

// === Error Handling ===
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

// === Start Server ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Strive Dashboard running on port ${PORT}`);
  console.log(`🌐 Public URL: http://localhost:${PORT}`);
});
