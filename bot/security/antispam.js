// /bot/security/antispam.js
import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import ProtectionConfig from '../../models/ProtectionConfig.js';

export function antispam(client) {
  const messageTracker = new Map(); // userId → { timestamps: [], guildId: string }

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const windowMs = 10_000; // 10 seconds
    for (const [userId, data] of messageTracker) {
      data.timestamps = data.timestamps.filter((ts) => now - ts <= windowMs);
      if (data.timestamps.length === 0) {
        messageTracker.delete(userId);
      }
    }
  }, 60_000); // Run every 60 seconds

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || !message.member) return;

    const { guild, author, channel } = message;

    // Fetch guild's anti-spam configuration
    let config;
    try {
      config = await ProtectionConfig.findOne({ guildId: guild.id });
    } catch (err) {
      logger.error('Failed to fetch ProtectionConfig', {
        guildId: guild.id,
        error: err.message,
      });
      return;
    }

    if (!config?.antiSpamEnabled) return;

    const userId = author.id;
    const now = Date.now();
    const windowMs = 10_000; // 10 seconds
    const maxMessages = 5; // Maximum messages allowed in window

    // Initialize or update user's message tracker
    if (!messageTracker.has(userId)) {
      messageTracker.set(userId, { timestamps: [], guildId: guild.id });
    }

    const userData = messageTracker.get(userId);
    // Ensure messages are tracked per guild
    if (userData.guildId !== guild.id) {
      userData.timestamps = [];
      userData.guildId = guild.id;
    }

    userData.timestamps.push(now);
    // Remove timestamps outside the window
    userData.timestamps = userData.timestamps.filter((ts) => now - ts <= windowMs);

    if (userData.timestamps.length > maxMessages) {
      logger.security('SPAM_DETECTED', { guildId: guild.id, userId });

      try {
        // Apply timeout (10 minutes)
        await message.member.timeout(10 * 60 * 1000, 'Anti-spam auto-mute');

        // Create embed for mute notification
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Anti-Spam Warning')
          .setDescription(`${author}, you've been muted for 10 minutes due to excessive messaging.`)
          .addFields(
            { name: 'Reason', value: 'Spam detection (too many messages in a short time)' },
            { name: 'Duration', value: '10 minutes' }
          )
          .setTimestamp()
          .setFooter({ text: `Guild: ${guild.name}`, iconURL: guild.iconURL() });

        // Attempt to send ephemeral message; fall back to non-ephemeral if necessary
        try {
          await channel.send({ content: `${author}`, embeds: [embed], ephemeral: true });
        } catch (ephemeralErr) {
          logger.warn('Ephemeral message failed, sending non-ephemeral', {
            guildId: guild.id,
            userId,
            error: ephemeralErr.message,
          });
          await channel.send({ content: `${author}`, embeds: [embed] });
        }
      } catch (err) {
        logger.error('Failed to mute spammer or send notification', {
          guildId: guild.id,
          userId,
          error: err.message,
        });

        // Send error embed to channel (non-ephemeral as fallback)
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Anti-Spam Error')
          .setDescription('Failed to apply anti-spam measures. Please contact an administrator.')
          .setTimestamp();

        await channel.send({ embeds: [errorEmbed] });
      }
    }
  });

  // Cleanup on bot shutdown
  client.on('close', () => {
    clearInterval(cleanupInterval);
    messageTracker.clear();
  });
}
