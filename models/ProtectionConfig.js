// /models/ProtectionConfig.js
import { Schema, model } from 'mongoose';
import { logger } from '../utils/logger.js';

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
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'protectionConfig',
  }
);

protectionConfigSchema.index({ guildId: 1 }, { unique: true });

protectionConfigSchema.post('save', function (doc) {
  logger.debug('ProtectionConfig saved', {
    guildId: doc.guildId,
    antiSpamEnabled: doc.antiSpamEnabled,
  });
});

export default model('ProtectionConfig', protectionConfigSchema);
