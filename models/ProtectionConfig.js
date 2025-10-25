// /models/ProtectionConfig.js
import { Schema, model } from 'mongoose';

const protectionConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => /^[0-9]{17,19}$/.test(v),
        message: 'Invalid Discord guild ID',
      },
    },
    antiSpamEnabled: {
      type: Boolean,
      default: false, // Default to disabled anti-spam
    },
  },
  {
    timestamps: true, // Track creation and update times
    collection: 'protectionConfig', // Explicit collection name
  }
);

// Ensure unique guildId
protectionConfigSchema.index({ guildId: 1 }, { unique: true });

export default model('ProtectionConfig', protectionConfigSchema);
