// /utils/crypto.js
import crypto from 'crypto';

const ALGO = 'aes-256-cbc';

/**
 * Encrypt a simple guild ID
 */
export function encryptGuildId(guildId, secret) {
  return encryptString(guildId, secret);
}

/**
 * Decrypt a simple guild ID
 */
export function decryptGuildId(token, secret) {
  return decryptString(token, secret);
}

/**
 * Encrypt any JSON object
 */
export function encryptJSON(obj, secret) {
  try {
    const json = JSON.stringify(obj);
    return encryptString(json, secret);
  } catch (err) {
    console.error('encryptJSON failed:', err);
    return null;
  }
}

/**
 * Decrypt an encrypted JSON token
 */
export function decryptJSON(token, secret) {
  try {
    const json = decryptString(token, secret);
    return JSON.parse(json);
  } catch (err) {
    console.error('decryptJSON failed:', err);
    return null;
  }
}

/**
 * Internal helpers for string encryption/decryption
 */
function encryptString(text, secret) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(secret).digest();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let enc = cipher.update(text, 'utf8', 'base64');
  enc += cipher.final('base64');
  return iv.toString('base64') + ':' + enc;
}

function decryptString(token, secret) {
  const [ivBase64, dataBase64] = token.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const encrypted = Buffer.from(dataBase64, 'base64');
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  let dec = decipher.update(encrypted, 'base64', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}
