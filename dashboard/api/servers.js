// /dashboard/api/servers.js
import GuildConfig from '../../models/GuildConfig.js';

export default function (app) {
  app.get('/api/servers', async (req, res) => {
    if (!req.session?.discordUser || !req.session?.userGuilds) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get guilds where user has ADMIN (permission bit 3 = 0b1000 = 8)
    const manageableGuilds = req.session.userGuilds.filter(guild => {
      return (BigInt(guild.permissions) & BigInt(8)) !== 0n;
    });

    // Enrich with bot presence (assume bot is in all for now; in prod: check DB or bot API)
    const servers = manageableGuilds.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
        : null,
      botJoined: true // In real app: check via shared DB or bot internal API
    }));

    res.json({ servers });
  });
}
