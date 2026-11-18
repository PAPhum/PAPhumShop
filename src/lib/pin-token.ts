import crypto from 'node:crypto';

export const PIN_COOKIE_NAME = 'paphum_admin_pin_ok';
export const PIN_SESSION_SECONDS = 60 * 60;

function getSigningSecret(): string {
  const explicit = process.env.PIN_TOKEN_SECRET?.trim();
  if (explicit) return explicit;

  const fallback = process.env.ENCRYPTION_SECRET_KEY?.trim();
  if (!fallback) {
    throw new Error('ยังไม่ได้ตั้งค่า PIN_TOKEN_SECRET หรือ ENCRYPTION_SECRET_KEY');
  }

  return crypto
    .createHash('sha256')
    .update(`pin-token:v1:${fallback}`)
    .digest('hex');
}

export function pinVersionFromSalt(pinSalt: string): string {
  return crypto.createHash('sha256').update(pinSalt).digest('hex').slice(0, 16);
}

export function signPinToken(
  userId: string,
  pinVersion: string,
  ttlSeconds: number = PIN_SESSION_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const payload = `${userId}.${pinVersion}.${exp}`;
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');

  return `${payload}.${signature}`;
}

export function verifyPinToken(
  token: string | undefined,
  userId: string,
  pinVersion: string
): boolean {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 4) return false;

  const [uid, version, exp, signature] = parts;
  if (uid !== userId || version !== pinVersion) return false;

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${uid}.${version}.${exp}`)
    .digest('hex');

  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (given.length !== wanted.length) return false;

  return crypto.timingSafeEqual(given, wanted);
}
