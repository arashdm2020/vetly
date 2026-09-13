import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
  const value = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('کلید رمزگذاری تنظیمات روی سرور تنظیم نشده است.');
  return Buffer.from(value, 'hex');
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64')).join('.');
}
export function decryptSecret(value: string) {
  const [iv, tag, body] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
}
