// /models/VerificationToken.js
import { Schema, model } from 'mongoose';

const verificationTokenSchema = new Schema({
  token: { type: String, required: true, index: true, unique: true },
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  roleId: { type: String, required: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  verifiedAt: Date,
  ipAddress: String,
  userAgent: String
}, { timestamps: true });

export default model('VerificationToken', verificationTokenSchema);
