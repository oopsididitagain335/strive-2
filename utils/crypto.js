// /utils/crypto.js
import crypto from 'crypto';

const ALGO = 'aes-256-cbc';

export function encryptJSON(obj, secret) {
  const json = JSON.stringify(obj);
  return encryptString(json, secret);
}

export function decryptJSON(token, secret) {
  const json = decryptString(token, secret);
  return JSON.parse(json);
}

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
