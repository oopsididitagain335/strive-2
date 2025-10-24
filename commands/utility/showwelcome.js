// /commands/utility/showwelcome.js
import { SlashCommandBuilder } from 'discord.js';
import Welcome from '../../../models/Welcome.js';

export const data = new SlashCommandBuilder()
  .setName('showwelcome')
  .setDescription('Shows the current welcome channel');

export async function execute(interaction) {
  const data = await Welcome.findOne({ guildId: interaction.guild.id });
  if (!data) {
    return interaction.reply({ content: '❌ No welcome channel set.', ephemeral: true });
  }
  const channel = interaction.guild.channels.cache.get(data.channelId);
  if (!channel) {
    return interaction.reply({ content: '⚠️ The saved channel no longer exists.', ephemeral: true });
  }
  await interaction.reply({ content: `✅ Current welcome channel: ${channel}`, ephemeral: true });
}
