// /utils/crypto.js
import crypto from 'crypto';

const ALGO = 'aes-256-cbc';

export function encryptGuildId(guildId, secret) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(guildId, 'utf8', 'base64');
  enc += cipher.final('base64');
  return iv.toString('base64') + ':' + enc;
}

export function decryptGuildId(token, secret) {
  try {
    const [ivBase64, dataBase64] = token.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    const encrypted = Buffer.from(dataBase64, 'base64');
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    let dec = decipher.update(encrypted, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return null;
  }
}
