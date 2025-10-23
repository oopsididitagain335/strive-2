// /dashboard/api/user.js
export default function (app) {
  app.get('/api/user', (req, res) => {
    if (!req.session?.discordUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, username, discriminator, avatar } = req.session.discordUser;
    res.json({
      user: {
        id,
        username,
        discriminator,
        avatar: avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`
          : null
      }
    });
  });
}
