import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('View the server shop');

export async function execute(interaction) {
  const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
  const items = config?.shopItems || [];

  if (items.length === 0) {
    return interaction.reply('🛒 The shop is empty! Ask an admin to add items.');
  }

  const description = items.map(item => 
    `**${item.name}** — ${item.price.toLocaleString()} coins\n> ${item.description || 'No description'}`
  ).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Server Shop')
    .setDescription(description)
    .setColor(0x00FF00);

  await interaction.reply({ embeds: [embed] });
}
