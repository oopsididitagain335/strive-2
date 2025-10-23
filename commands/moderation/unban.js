import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by ID')
  .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const userId = interaction.options.getString('user_id');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  if (!/^\d{17,20}$/.test(userId)) {
    return interaction.reply({ content: '❌ Invalid user ID.', ephemeral: true });
  }

  try {
    await interaction.guild.bans.remove(userId, reason);
    logger.audit('MODERATION_UNBAN', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      targetId: userId,
      reason,
    });
    await interaction.reply(`✅ Unbanned user ID: \`${userId}\``);
  } catch (err) {
    if (err.code === 10026) {
      return interaction.reply({ content: '❌ That user is not banned.', ephemeral: true });
    }
    logger.error('UNBAN_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to unban user.', ephemeral: true });
  }
}
