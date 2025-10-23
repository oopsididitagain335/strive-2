import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  if (target.id === interaction.user.id) {
    return interaction.reply({ content: '❌ You cannot warn yourself.', ephemeral: true });
  }

  if (target.bot) {
    return interaction.reply({ content: '❌ You cannot warn bots.', ephemeral: true });
  }

  // Log to audit trail
  logger.audit('MODERATION_WARN', {
    guildId: interaction.guild.id,
    moderatorId: interaction.user.id,
    targetId: target.id,
    reason,
  });

  await interaction.reply(`✅ ${target} has been warned for: **${reason}**`);
}
