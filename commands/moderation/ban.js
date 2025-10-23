// /commands/moderation/ban.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason';

  try {
    await interaction.guild.bans.create(user.id, { reason });
    logger.audit('MODERATION_BAN', {
      guildId: interaction.guild.id,
      moderator: interaction.user.id,
      target: user.id,
      reason
    });
    await interaction.reply(`✅ Banned ${user.tag}`);
  } catch (err) {
    logger.error('BAN_FAILED', { error: err.message });
    await interaction.reply({ content: '❌ Failed to ban user.', ephemeral: true });
  }
}
