// /bot/utils/audit.js
import { logger } from './logger.js';
import ModerationCase from '../../models/ModerationCase.js';

export function initAudit(client) {
  client.on('guildMemberAdd', (member) => {
    logger.audit('MEMBER_JOIN', { guildId: member.guild.id, userId: member.id });
  });

  client.on('guildMemberRemove', (member) => {
    logger.audit('MEMBER_LEAVE', { guildId: member.guild.id, userId: member.id });
  });

  // Optional: auto-save moderation cases to DB
  // This is usually done in command handlers, but you can centralize here if needed
}

// Helper to create a moderation case
export async function createModCase({ guildId, targetId, moderatorId, action, reason, duration }) {
  const caseId = `case-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  await ModerationCase.create({
    caseId,
    guildId,
    targetId,
    moderatorId,
    action,
    reason,
    duration
  });
  logger.audit(`MOD_CASE_CREATED_${action}`, { caseId, guildId, targetId, reason });
  return caseId;
}
