import { SlashCommandBuilder, PermissionFlagsBits, time } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Timeout (mute) a user')
  .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
  .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (max 43200 = 30 days)').setMinValue(1).setMaxValue(43200).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const duration = interaction.options.getInteger('duration');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: '❌ User not in server.', ephemeral: true });
  }

  if (!targetMember.moderatable) {
    return interaction.reply({ content: '❌ I cannot mute this user.', ephemeral: true });
  }

  const expiresAt = Date.now() + duration * 60_000;
  if (expiresAt > Date.now() + 2_592_000_000) { // 30 days max
    return interaction.reply({ content: '❌ Max mute duration is 30 days.', ephemeral: true });
  }

  try {
    await targetMember.timeout(expiresAt - Date.now(), reason);
    logger.audit('MODERATION_MUTE', {
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      targetId: targetUser.id,
      duration,
      reason,
    });
    await interaction.reply(`✅ Muted ${targetUser} for **${duration} minute(s)** (until ${time(new Date(expiresAt), 'R')})`);
  } catch (err) {
    logger.error('MUTE_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.reply({ content: '❌ Failed to mute user.', ephemeral: true });
  }
}
