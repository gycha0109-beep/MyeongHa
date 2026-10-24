import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** One-use browser actor is already bound to a verified PortOne attempt in
 * SQL. This short-lived state binds its OAuth start to the SAME browser
 * possession digest, without sending the digest or cookie into a callback.
 */
export const PORTONE_PREENROLLMENT_SOCIAL_STATE_V1 = Object.freeze({
  version: 'myeongha-preaccount-social-state-v1',
  maximumAgeMs: 600_000,
  maximumFutureSkewMs: 30_000,
  stateLength: 85,
  activeByDefault: false,
} as const);
const DIGEST = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const STATE = /^[0-9a-z]{10}[a-f0-9]{32}[A-Za-z0-9_-]{43}$/u;

function sign(secret: string, digest: string, timestamp: string, random: string): string {
  if (typeof secret !== 'string' || secret.length < 32 ||
      secret.trim() !== secret || !DIGEST.test(digest) ||
      !/^[0-9a-z]{10}$/u.test(timestamp) || !NONCE.test(random)) {
    throw new Error('Social preenrollment state signing authority is invalid.');
  }
  return createHmac('sha256', secret)
    .update(PORTONE_PREENROLLMENT_SOCIAL_STATE_V1.version)
    .update('\0')
    .update(digest)
    .update('\0')
    .update(timestamp)
    .update('\0')
    .update(random)
    .digest('base64url');
}

export function issuePortOneBoundSocialStateV1(input: Readonly<{
  secret: string; bindingDigest: string; nowEpochMs: number;
  nonce?: string;
}>): string {
  if (!Number.isSafeInteger(input.nowEpochMs) || input.nowEpochMs < 0) {
    throw new Error('Social preenrollment state clock is invalid.');
  }
  const timestamp = input.nowEpochMs.toString(36).padStart(10, '0');
  if (timestamp.length !== 10) throw new Error('Social state timestamp overflow.');
  const random = input.nonce ?? randomBytes(16).toString('hex');
  const signature = sign(input.secret, input.bindingDigest, timestamp, random);
  return timestamp + random + signature;
}

export function verifyPortOneBoundSocialStateV1(input: Readonly<{
  secret: string; bindingDigest: string; state: unknown; nowEpochMs: number;
}>): boolean {
  if (typeof input.state !== 'string' || !STATE.test(input.state) ||
      !Number.isSafeInteger(input.nowEpochMs) ||
      input.nowEpochMs < 0 || !DIGEST.test(input.bindingDigest)) return false;
  const issuedAt = Number.parseInt(input.state.slice(0, 10), 36);
  if (!Number.isSafeInteger(issuedAt) ||
      issuedAt > input.nowEpochMs + PORTONE_PREENROLLMENT_SOCIAL_STATE_V1.maximumFutureSkewMs ||
      input.nowEpochMs - issuedAt > PORTONE_PREENROLLMENT_SOCIAL_STATE_V1.maximumAgeMs) return false;
  let expected: string;
  try {
    expected = sign(input.secret, input.bindingDigest,
      input.state.slice(0, 10), input.state.slice(10, 42));
  } catch { return false; }
  const a = Buffer.from(input.state.slice(42), 'ascii');
  const b = Buffer.from(expected, 'ascii');
  return a.length === b.length && timingSafeEqual(a, b);
}
