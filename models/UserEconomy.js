// /models/UserEconomy.js
import { Schema, model } from 'mongoose';

const userEconomySchema = new Schema(
  {
    userId: { type: String, required: true, trim: true },
    guildId: { type: String, required: true, trim: true },
    balance: { type: Number, default: 0, min: 0 },
    lastDaily: { type: Date, default: () => new Date(0) }, // Default to epoch for easier comparison
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    collection: 'userEconomy', // Explicitly set collection name for clarity
  }
);

// Ensure unique user-guild pair
userEconomySchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Optional: Add validation to prevent negative balance updates
userEconomySchema.pre('save', function (next) {
  if (this.balance < 0) {
    this.balance = 0; // Enforce non-negative balance
  }
  next();
});

export default model('UserEconomy', userEconomySchema);
