// models/Welcome.js
import mongoose from 'mongoose';

const welcomeSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true, // Ensures one welcome config per guild
  },
  channelId: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    default: null, // Optional image URL
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
});

export default mongoose.model('Welcome', welcomeSchema);
