// /commands/premium/premium.js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('Manage your Strive premium subscription')
  .addSubcommand(sc => sc.setName('check').setDescription('Check if payment went through'))
  .addSubcommand(sc => sc.setName('status').setDescription('View your current plan'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'check') {
    await interaction.reply('✅ Checking payment status...');
  } else if (sub === 'status') {
    await interaction.reply('✅ You are on the Free plan.');
  }
}
