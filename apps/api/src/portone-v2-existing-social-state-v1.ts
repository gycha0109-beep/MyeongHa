import { createHmac, randomBytes } from 'node:crypto';
import { issuePortOneBoundSocialStateV1, verifyPortOneBoundSocialStateV1 } from './portone-v2-preenrollment-social-state-v1.js';

/** A separate 10-minute, same-browser OAuth correlation proof for EXISTING Members.
 * Never grants age authority to a new Member; no provider or credential data
 * is stored. This is not the A1 verified-age cookie.
 */
export const EXISTING_MEMBER_SOCIAL_STATE_COOKIE_V1 =
  '__Host-myeongha-existing-social-v1' as const;
const NONCE = /^[A-Za-z0-9_-]{43}$/u;
const PURPOSE = 'myeongha-existing-member-social-state-v1';
const ISSUED_STATE = /^[0-9a-z]{10}[a-f0-9]{32}[A-Za-z0-9_-]{43}$/u;

/** HMAC-only durable correlation; raw OAuth state/cookie never enters PostgreSQL. */
export function fingerprintExistingMemberSocialStateV1(input: Readonly<{
  secret: string;
  state: string;
}>): string {
  if (typeof input.secret !== 'string' || input.secret.length < 32 ||
      input.secret.trim() !== input.secret || !ISSUED_STATE.test(input.state)) {
    throw new Error('Existing Member OAuth digest cannot be issued.');
  }
  return createHmac('sha256', input.secret)
    .update(PURPOSE).update('\0').update('state').update('\0')
    .update(input.state).digest('hex');
}


function bindingDigest(secret: string, nonce: string): string {
  if (typeof secret !== 'string' || secret.length < 32 ||
      secret.trim() !== secret || !NONCE.test(nonce)) {
    throw new Error('Existing Social OAuth signing authority unavailable.');
  }
  return createHmac('sha256', secret).update(PURPOSE).update('\0').update(nonce).digest('hex');
}

export function issueExistingMemberSocialStateV1(input: Readonly<{
  secret: string;
  nowEpochMs: number;
  nonceFactory?: () => string;
}>): Readonly<{ state: string; cookie: string }> {
  const nonce = input.nonceFactory?.() ?? randomBytes(32).toString('base64url');
  const digest = bindingDigest(input.secret, nonce);
  const state = issuePortOneBoundSocialStateV1({
    secret: input.secret, bindingDigest: digest, nowEpochMs: input.nowEpochMs,
  });
  return Object.freeze({
    state,
    cookie: `${EXISTING_MEMBER_SOCIAL_STATE_COOKIE_V1}=${nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict`,
  });
}

export function expireExistingMemberSocialStateCookieV1(): string {
  return `${EXISTING_MEMBER_SOCIAL_STATE_COOKIE_V1}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function verifyExistingMemberSocialStateV1(input: Readonly<{
  secret: string;
  request: Request;
  state: unknown;
  nowEpochMs: number;
}>): boolean {
  const cookies = input.request.headers.get('cookie');
  if (cookies === null || cookies.length > 8192) return false;
  let nonce: string | null = null;
  for (const part of cookies.split(';')) {
    const item = part.trim();
    if (!item.startsWith(EXISTING_MEMBER_SOCIAL_STATE_COOKIE_V1 + '=')) continue;
    if (nonce !== null) return false;
    const value = item.slice(EXISTING_MEMBER_SOCIAL_STATE_COOKIE_V1.length + 1);
    if (!NONCE.test(value)) return false;
    nonce = value;
  }
  if (nonce === null) return false;
  try {
    return verifyPortOneBoundSocialStateV1({
      secret: input.secret,
      bindingDigest: bindingDigest(input.secret, nonce),
      state: input.state,
      nowEpochMs: input.nowEpochMs,
    });
  } catch { return false; }
}
