import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import ModerationCase from '../../models/ModerationCase.js';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('View details of a moderation case')
  .addStringOption(o => o.setName('case_id').setDescription('Case ID').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const caseId = interaction.options.getString('case_id');
  const modCase = await ModerationCase.findOne({
    guildId: interaction.guild.id,
    caseId
  });

  if (!modCase) {
    return interaction.reply({ content: '❌ Case not found.', ephemeral: true });
  }

  const actionEmoji = { WARN: '⚠️', KICK: '👢', BAN: '🔨', MUTE: '🔇' }[modCase.action] || '📝';

  await interaction.reply({
    embeds: [{
      title: `${actionEmoji} Case #${modCase.caseId}`,
      fields: [
        { name: 'User', value: `<@${modCase.targetId}> (\`${modCase.targetId}\`)`, inline: true },
        { name: 'Moderator', value: `<@${modCase.moderatorId}>`, inline: true },
        { name: 'Action', value: modCase.action, inline: true },
        { name: 'Reason', value: modCase.reason || 'None', inline: false },
        { name: 'Date', value: `<t:${Math.floor(modCase.createdAt.getTime() / 1000)}:R>`, inline: false }
      ],
      color: 0x00AAFF
    }]
  });
}
