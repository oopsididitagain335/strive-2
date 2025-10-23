import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .addIntegerOption(o => o.setName('delete_days').setDescription('Delete messages from last N days (0-7)').setMinValue(0).setMaxValue(7))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const deleteDays = interaction.options.getInteger('delete_days') || 0;

  if (targetUser.id === interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ You cannot ban the server owner.', ephemeral: true });
  }

  try {
    await interaction.guild.bans.create(targetUser.id, {
      reason,
      deleteMessageSeconds: deleteDays * 86400,
    });

    logger.audit('MODERATION_BAN', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      targetId: targetUser.id,
      reason,
      deleteDays,
    });

    await interaction.reply(`✅ Banned ${targetUser.tag} | ${reason}`);
  } catch (err) {
    logger.error('BAN_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to ban user. Check permissions or user status.', ephemeral: true });
  }
}
