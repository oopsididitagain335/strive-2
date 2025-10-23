// /bot/security/antispam.js
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';

export function antispam(client) {
  const messageTracker = new Map(); // userId → [timestamps]

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const { guild, author } = message;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.antiSpamEnabled) return;

    const userId = author.id;
    const now = Date.now();
    const windowMs = 10_000; // 10 seconds
    const maxMessages = 5;

    if (!messageTracker.has(userId)) {
      messageTracker.set(userId, []);
    }

    const userMessages = messageTracker.get(userId);
    userMessages.push(now);
    while (userMessages.length > 0 && now - userMessages[0] > windowMs) {
      userMessages.shift();
    }

    if (userMessages.length > maxMessages) {
      logger.security('SPAM_DETECTED', { guildId: guild.id, userId });

      try {
        await message.member.timeout(10 * 60 * 1000, 'Anti-spam auto-mute');
        await message.channel.send({
          content: `${author}, you've been muted for 10 minutes due to spam.`,
          ephemeral: true
        });
      } catch (err) {
        logger.error('Failed to mute spammer', { error: err.message });
      }
    }
  });
}
