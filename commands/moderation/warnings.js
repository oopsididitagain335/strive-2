import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import ModerationCase from '../../models/ModerationCase.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('View a user’s warnings')
  .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const cases = await ModerationCase.find({
    guildId: interaction.guild.id,
    targetId: user.id,
    action: 'WARN'
  }).sort({ createdAt: -1 }).limit(10);

  if (cases.length === 0) {
    return interaction.reply(`${user} has no warnings.`);
  }

  const description = cases.map(c => 
    `• **${c.reason}** (${new Date(c.createdAt).toLocaleDateString()})`
  ).join('\n');

  await interaction.reply({
    embeds: [{
      title: `⚠️ Warnings for ${user.username}`,
      description,
      color: 0xFFFF00
    }]
  });
}
