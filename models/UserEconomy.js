// /models/UserEconomy.js
import { Schema, model } from 'mongoose';

const userEconomySchema = new Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true, index: true },
  balance: { type: Number, default: 0, min: 0 },
  lastDaily: { type: Number, default: 0 }
}, { timestamps: true });

userEconomySchema.index({ userId: 1, guildId: 1 }, { unique: true });

export default model('UserEconomy', userEconomySchema);
