// /models/Ticket.js
import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  channelId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  closed: { type: Boolean, default: false },
});

export default mongoose.model('Ticket', ticketSchema);
