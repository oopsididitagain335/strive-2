// /models/Ticket.js
import { Schema, model } from 'mongoose';

const ticketSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  threadId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  reason: String,
  createdAt: { type: Date, default: Date.now },
  closedAt: Date
}, { timestamps: true });

export default model('Ticket', ticketSchema);
