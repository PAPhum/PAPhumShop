import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_HEX_LENGTH = 64;

function getMasterKey(secretKeyHex?: string): Buffer {
  const keyHex = secretKeyHex ?? process.env.ENCRYPTION_SECRET_KEY;
  if (!keyHex || keyHex.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('ENCRYPTION_SECRET_KEY must be a valid 64-character hex string (32 bytes).');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * เข้ารหัสข้อความลับด้วย AES-256-GCM
 * คืนค่าในรูปแบบ iv:authTag:cipherText (Hex)
 */
export function encryptSecret(plainText: string, secretKeyHex?: string): string {
  if (!plainText) {
    return '';
  }

  const key = getMasterKey(secretKeyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * ถอดรหัสข้อความลับที่เข้ารหัสด้วย encryptSecret
 */
export function decryptSecret(payload: string, secretKeyHex?: string): string {
  if (!payload) {
    return '';
  }

  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getMasterKey(secretKeyHex);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * สร้าง Hash และ Salt สำหรับรหัส PIN 6 หลักของแอดมิน
 */
export function hashAdminPin(pin: string): { hash: string; salt: string } {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('Admin PIN must be exactly 6 digits.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin, salt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt,
  };
}

/**
 * ตรวจสอบรหัส PIN 6 หลักด้วย timingSafeEqual ป้องกัน Timing Attack
 */
export function verifyAdminPin(pin: string, storedHash: string, storedSalt: string): boolean {
  if (!/^\d{6}$/.test(pin) || !storedHash || !storedSalt) {
    return false;
  }
  const derivedKey = crypto.scryptSync(pin, storedSalt, 64);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, storedBuffer);
}