import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove timeout from a user')
  .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.reply({ content: '❌ User not in server.', ephemeral: true });
  }

  if (!targetMember.isCommunicationDisabled()) {
    return interaction.reply({ content: '❌ User is not muted.', ephemeral: true });
  }

  try {
    await targetMember.timeout(null, 'Unmuted by moderator');
    logger.audit('MODERATION_UNMUTE', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      targetId: targetUser.id,
    });
    await interaction.reply(`✅ Unmuted ${targetUser}`);
  } catch (err) {
    logger.error('UNMUTE_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to unmute user.', ephemeral: true });
  }
}
