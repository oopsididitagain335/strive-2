import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserEconomy from '../../models/UserEconomy.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top 10 richest users');

export async function execute(interaction) {
  await interaction.deferReply();

  const topUsers = await UserEconomy.find({ guildId: interaction.guild.id })
    .sort({ balance: -1 })
    .limit(10);

  if (topUsers.length === 0) {
    return interaction.editReply('📊 No economy data yet.');
  }

  const description = topUsers.map((u, i) => {
    const userTag = interaction.guild.members.cache.get(u.userId)?.user?.tag || `User ${u.userId}`;
    return `${i + 1}. **${userTag}** — ${u.balance.toLocaleString()} coins`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🏆 Economy Leaderboard')
    .setDescription(description)
    .setColor(0xFFD700);

  await interaction.editReply({ embeds: [embed] });
}
