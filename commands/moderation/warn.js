import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a user')
  .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const reason = interaction.options.getString('reason');

  if (!member) return interaction.reply({ content: '❌ User not in server.', ephemeral: true });

  // Log to DB or channel (simplified)
  logger.audit('MOD_WARN', { guildId: interaction.guild.id, target: user.id, moderator: interaction.user.id, reason });

  await interaction.reply(`✅ ${user} has been warned for: ${reason}`);
}
