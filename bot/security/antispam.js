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
    let removed = 0;
    for (const [userId, data] of messageTracker) {
      data.timestamps = data.timestamps.filter((ts) => now - ts <= windowMs);
      if (data.timestamps.length === 0) {
        messageTracker.delete(userId);
        removed++;
      }
    }
    logger.debug('Cleaned up messageTracker', { size: messageTracker.size, removed });
  }, 60_000); // Run every 60 seconds

  client.on('messageCreate', async (message) => {
    // Skip bots, non-guild messages, or messages without a member
    if (message.author.bot || !message.guild || !message.member) {
      logger.debug('Message ignored', {
        userId: message.author.id,
        guildId: message.guild?.id,
        isBot: message.author.bot,
        hasGuild: !!
