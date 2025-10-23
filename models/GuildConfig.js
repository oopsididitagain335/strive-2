// /models/GuildConfig.js
import { Schema, model } from 'mongoose';

const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, index: true, unique: true },
  
  // Moderation
  autoModEnabled: { type: Boolean, default: false },
  autoModKeywords: [{ type: String }],
  antiSpamEnabled: { type: Boolean, default: false },
  antiRaidEnabled: { type: Boolean, default: false },
  punishRoleId: String,
  logChannelId: String,

  // Economy
  shopItems: [{
    id: String,
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    type: { type: String, enum: ['role', 'custom'], default: 'custom' },
    roleId: String,
    effect: String
  }],

  // Welcome
  welcomeEnabled: { type: Boolean, default: false },
  welcomeChannelId: String,
  welcomeMessage: String,

  // Verification
  verificationEnabled: { type: Boolean, default: false },
  verificationRoleId: String,
  verificationChannelId: String,

  // Music
  djRoleId: String,
  defaultVolume: { type: Number, default: 80, min: 0, max: 200 },

  // Automation
  birthdayRoleId: String,
  rssFeeds: [String]
}, { timestamps: true });

export default model('GuildConfig', guildConfigSchema);
