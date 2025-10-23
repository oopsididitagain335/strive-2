// /commands/premium/check.js
import { SlashCommandBuilder } from 'discord.js';
import { stripe } from '../../utils/stripeClient.js';
import Subscription from '../../models/Subscription.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('Check or manage your premium status')
  .addSubcommand(sc => sc.setName('check').setDescription('Check if your payment went through'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'check') return;

  await interaction.deferReply({ ephemeral: true });

  // Find user's latest unpaid session
  const subscription = await Subscription.findOne({
    discordUserId: interaction.user.id,
    isActive: false
  }).sort({ createdAt: -1 });

  if (!subscription) {
    return interaction.editReply('🔍 No pending subscription found. Use `/subscribe` to get started.');
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(subscription.stripeSessionId);

    if (session.payment_status === 'paid' && session.subscription) {
      // Mark as active
      subscription.isActive = true;
      subscription.stripeSubscriptionId = session.subscription;
      await subscription.save();

      // Assign role (if configured)
      const roleId = process.env.PREMIUM_ROLE_ID; // or fetch from GuildConfig
      if (roleId && interaction.guild) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (member && !member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(() => {});
        }
      }

      logger.audit('PREMIUM_ACTIVATED', {
        userId: interaction.user.id,
        plan: subscription.plan,
        guildId: interaction.guild?.id
      });

      await interaction.editReply('🎉 **Payment confirmed!** You now have premium access.');
    } else if (session.status === 'expired') {
      await interaction.editReply('❌ Your checkout session expired. Please try again.');
    } else {
      await interaction.editReply('⏳ Payment not yet confirmed. Try again in a few seconds.');
    }

  } catch (err) {
    logger.error('CHECK_PAYMENT_ERROR', { error: err.message });
    await interaction.editReply('❌ Unable to verify payment. Contact support.');
  }
}
