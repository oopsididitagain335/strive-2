// utils/crypto.js
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recommended for GCM
const TAG_LEN = 16;

export function encryptJSON(obj, secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const plaintext = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Return base64 parts joined by :
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptJSON(token, secret) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [ivB64, encB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const key = crypto.createHash('sha256').update(String(secret)).digest();
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}
