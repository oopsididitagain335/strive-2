// /models/Subscription.js
import { Schema, model } from 'mongoose';

const subscriptionSchema = new Schema({
  discordUserId: { type: String, required: true, index: true },
  discordUsername: { type: String, required: true },
  guildId: { type: String, required: true, index: true },
  plan: {
    type: String,
    enum: [
      'basic_monthly', 'basic_yearly',
      'premium_monthly', 'premium_yearly',
      'ultra_monthly', 'ultra_yearly'
    ],
    required: true
  },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripeSessionId: { type: String, required: true, index: true },
  isActive: { type: Boolean, default: false },
  currentPeriodEnd: Date
}, { timestamps: true });

export default model('Subscription', subscriptionSchema);
