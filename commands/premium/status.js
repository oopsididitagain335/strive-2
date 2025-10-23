// /commands/premium/status.js
import { SlashCommandBuilder } from 'discord.js';
import Subscription from '../../models/Subscription.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('Check your premium status')
  .addSubcommand(sc => sc.setName('status').setDescription('View your current plan'));

export async function execute(interaction) {
  const sub = await Subscription.findOne({
    discordUserId: interaction.user.id,
    isActive: true
  }).sort({ updatedAt: -1 });

  if (sub) {
    const planName = {
      basic_monthly: 'Basic (Monthly)',
      basic_yearly: 'Basic (Yearly)',
      premium_monthly: 'Professional (Monthly)',
      premium_yearly: 'Professional (Yearly)',
      ultra_monthly: 'Business (Monthly)',
      ultra_yearly: 'Business (Yearly)'
    }[sub.plan] || sub.plan;

    await interaction.reply({
      content: `✅ You are subscribed to **${planName}**! Thank you for supporting Strive.`,
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: '❌ You do not have an active premium subscription.\nUse `/subscribe` to upgrade!',
      ephemeral: true
    });
  }
}
