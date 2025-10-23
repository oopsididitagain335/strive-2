// /commands/premium/check.js
import { SlashCommandBuilder } from 'discord.js';
import Subscription from '../../models/Subscription.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('Check premium status')
  .addSubcommand(sc => sc.setName('check').setDescription('Check if payment went through'));

export async function execute(interaction) {
  const sub = await Subscription.findOne({
    discordUserId: interaction.user.id,
    isActive: true
  });

  if (sub) {
    await interaction.reply('✅ You have an active premium subscription!');
  } else {
    await interaction.reply('❌ No active premium subscription.');
  }
}
