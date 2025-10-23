// /dashboard/api/user.js
import { app } from '../server.js'; // You'll need to export app or restructure

// Instead, we attach to a shared app instance.
// For modularity, we'll assume `server.js` exports `app`

// But to keep it simple, we'll define routes inline in server.js in practice.
// However, per your request, here's a modular version:

export default (app) => {
  app.get('/api/user', (req, res) => {
    res.json({
      user: {
        id: req.session.discordUser.id,
        username: req.session.discordUser.username,
        avatar: req.session.discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${req.session.discordUser.id}/${req.session.discordUser.avatar}.png`
          : null
      }
    });
  });
};
