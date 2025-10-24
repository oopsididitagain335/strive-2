// models/Welcome.js
import mongoose from 'mongoose';

const welcomeSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  channelId: {
    type: String,
    required: true
  }
});

export default mongoose.model('Welcome', welcomeSchema);
