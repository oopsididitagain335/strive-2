// /bot/events/guildMemberAdd.js
import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';

export const name = 'guildMemberAdd';
export const once = false;

export async function execute(member, client) {
  const { guild } = member;
  logger.audit('MEMBER_JOIN', { guildId: guild.id, userId: member.id });

  const config = await GuildConfig.findOne({ guildId: guild.id });
  if (!config?.welcomeEnabled || !config.welcomeChannelId) return;

  const channel = guild.channels.cache.get(config.welcomeChannelId);
  if (!channel || !channel.isTextBased()) return;

  const message = (config.welcomeMessage || 'Welcome {user}!')
    .replace(/{user}/g, member.toString())
    .replace(/{server}/g, guild.name);

  try {
    await channel.send({
      content: message,
      embeds: [
        new EmbedBuilder()
          .setThumbnail(member.displayAvatarURL())
          .setColor(0x00FF00)
      ]
    });
  } catch (err) {
    logger.warn('Welcome message failed', { guildId: guild.id, error: err.message });
  }
}
