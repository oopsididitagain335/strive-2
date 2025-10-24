// models/WelcomeChannel.js
const mongoose = require("mongoose");

const welcomeChannelSchema = new mongoose.Schema({
  guildId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  channelId: { 
    type: String, 
    required: true 
  },
  imageUrl: { 
    type: String, 
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null
        try {
          new URL(v);
          return /\.(jpg|jpeg|png|gif|webp)$/i.test(v);
        } catch {
          return false;
        }
      },
      message: props => `${props.value} is not a valid image URL!`
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("WelcomeChannel", welcomeChannelSchema);
