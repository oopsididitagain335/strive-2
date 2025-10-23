// /models/ModerationCase.js
import { Schema, model } from 'mongoose';

const moderationCaseSchema = new Schema({
  caseId: { type: String, required: true },
  guildId: { type: String, required: true, index: true },
  targetId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  action: {
    type: String,
    enum: ['WARN', 'KICK', 'BAN', 'MUTE', 'UNBAN', 'UNMUTE'],
    required: true
  },
  reason: String,
  duration: Number, // in ms (for mutes)
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

moderationCaseSchema.index({ guildId: 1, targetId: 1 });

export default model('ModerationCase', moderationCaseSchema);
