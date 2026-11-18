import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  hashAdminPin,
  verifyAdminPin,
} from '../../src/lib/crypto';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const WRONG_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('AES-256-GCM Secret Encryption', () => {
  it('encrypts and decrypts game credentials and 2FA codes accurately', () => {
    const rawPassword = 'P@phum#RoV2026!Secret';
    const encrypted = encryptSecret(rawPassword, TEST_KEY);

    expect(encrypted).not.toBe(rawPassword);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decryptSecret(encrypted, TEST_KEY);
    expect(decrypted).toBe(rawPassword);
  });

  it('produces unique ciphertexts for identical plaintexts due to random IV', () => {
    const plain = 'same-password-123';
    const cipher1 = encryptSecret(plain, TEST_KEY);
    const cipher2 = encryptSecret(plain, TEST_KEY);

    expect(cipher1).not.toBe(cipher2);
    expect(decryptSecret(cipher1, TEST_KEY)).toBe(plain);
    expect(decryptSecret(cipher2, TEST_KEY)).toBe(plain);
  });

  it('returns empty string when input is empty', () => {
    expect(encryptSecret('', TEST_KEY)).toBe('');
    expect(decryptSecret('', TEST_KEY)).toBe('');
  });

  it('throws an error when decrypting with a wrong key or tampered payload', () => {
    const encrypted = encryptSecret('top-secret-2fa', TEST_KEY);

    expect(() => decryptSecret(encrypted, WRONG_KEY)).toThrow();

    const parts = encrypted.split(':');
    const tampered = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
    expect(() => decryptSecret(tampered, TEST_KEY)).toThrow();
  });

  it('throws an error when master key length is invalid', () => {
    expect(() => encryptSecret('hello', 'short-key')).toThrow(
      'ENCRYPTION_SECRET_KEY must be a valid 64-character hex string (32 bytes).'
    );
  });
});

describe('Admin 6-Digit PIN Security', () => {
  it('hashes and verifies a valid 6-digit PIN', () => {
    const { hash, salt } = hashAdminPin('254911');
    expect(verifyAdminPin('254911', hash, salt)).toBe(true);
    expect(verifyAdminPin('000000', hash, salt)).toBe(false);
  });

  it('rejects non-6-digit PIN formats', () => {
    expect(() => hashAdminPin('12345')).toThrow('Admin PIN must be exactly 6 digits.');
    expect(() => hashAdminPin('abcdef')).toThrow('Admin PIN must be exactly 6 digits.');
    const { hash, salt } = hashAdminPin('123456');
    expect(verifyAdminPin('12345', hash, salt)).toBe(false);
  });
});