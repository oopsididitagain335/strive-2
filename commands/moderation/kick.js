import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a user from the server')
  .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: '❌ User is not in this server.', ephemeral: true });
  }

  if (!targetMember.kickable) {
    return interaction.reply({ content: '❌ I cannot kick this user (higher role or owner).', ephemeral: true });
  }

  try {
    await targetMember.kick(reason);
    logger.audit('MODERATION_KICK', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      targetId: targetUser.id,
      reason,
    });
    await interaction.reply(`✅ Kicked ${targetUser.tag} | ${reason}`);
  } catch (err) {
    logger.error('KICK_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to kick user. Check my permissions.', ephemeral: true });
  }
}
