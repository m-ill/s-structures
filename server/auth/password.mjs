import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return { salt, scrypt: derived.toString('hex') };
}

export async function verifyPassword(password, salt, expectedHex) {
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters.' };
  }
  return { ok: true };
}
