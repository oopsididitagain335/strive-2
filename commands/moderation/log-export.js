import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import ModerationCase from '../../models/ModerationCase.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('logs')
  .setDescription('Export moderation logs')
  .addSubcommand(sc => sc
    .setName('export')
    .setDescription('Download all moderation cases as JSON')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== 'export') return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const cases = await ModerationCase.find({ guildId: interaction.guild.id });
    const data = JSON.stringify(cases.map(c => ({
      caseId: c.caseId,
      action: c.action,
      targetId: c.targetId,
      moderatorId: c.moderatorId,
      reason: c.reason,
      createdAt: c.createdAt
    })), null, 2);

    const buffer = Buffer.from(data, 'utf-8');
    await interaction.editReply({
      content: '✅ Moderation log export ready.',
      files: [{ attachment: buffer, name: `moderation-logs-${interaction.guild.id}.json` }]
    });

    logger.audit('LOGS_EXPORTED', { guildId: interaction.guild.id, moderator: interaction.user.id });
  } catch (err) {
    logger.error('LOGS_EXPORT_FAILED', { guildId: interaction.guild.id, error: err.message });
    await interaction.editReply('❌ Failed to export logs.');
  }
}
