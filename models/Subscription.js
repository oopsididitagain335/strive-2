// /models/Subscription.js
import { Schema, model } from 'mongoose';

const subscriptionSchema = new Schema({
  discordUserId: { type: String, required: true },
  discordUsername: { type: String, required: true },
  plan: {
    type: String,
    enum: ['basic_monthly', 'basic_yearly', 'premium_monthly', 'premium_yearly', 'ultra_monthly', 'ultra_yearly'],
    required: true
  },
  stripeSessionId: { type: String, required: true, index: true },
  isActive: { type: Boolean, default: false },
  guildId: String, // for role assignment
  roleId: String,  // role to grant
}, { timestamps: true });

export default model('Subscription', subscriptionSchema);
