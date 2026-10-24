import { createHmac, randomBytes } from 'node:crypto';
import type { PostgresSubjectPoolV1, PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const PORTONE_PREENROLLMENT_AGE_AUTHORITY_V1 = Object.freeze({
  proposal: 'supabase/proposals/1741_portone_preenrollment_age_authority_v1.proposed.sql',
  active: false,
  cookieName: '__Host-myeongha-preage-v1',
  cookieMaxAgeSeconds: 600,
  use: 'verified-14-plus-actor-before-Subject-issuance',
  identityRetention: '10-minute-database-clock-TTL',
} as const);

const PROOF_VERSION = 'myeongha-portone-preenrollment-binding-v1' as const;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ATTEMPT_PATTERN = /^iv[a-f0-9]{32}$/u;
type AgeBand = 'free_minor' | 'adult';
export type PortOnePreenrollmentAgeBandV1 = AgeBand;
export interface PortOnePreenrollmentIssuedAttemptV1 {
  readonly identityVerificationId: string;
  readonly expiresAt: string;
}
type IssuedRow = Readonly<{ identityVerificationId: unknown; expiresAt: unknown }>;
type BooleanRow = Readonly<{ accepted: unknown }>;
type BandRow = Readonly<{ ageBand: unknown }>;

export function issuePortOnePreenrollmentHttpOnlyNonceV1(): string {
  return randomBytes(32).toString('base64url');
}

/** A high-entropy HttpOnly cookie, NOT an Auth or Guest Subject token. */
export function fingerprintPortOnePreenrollmentBindingV1(input: Readonly<{
  rawNonce: string;
  secret: string;
}>): string {
  if (!NONCE_PATTERN.test(input.rawNonce) || typeof input.secret !== 'string' ||
      input.secret.trim() !== input.secret || input.secret.length < 32) {
    throw new Error('PortOne preenrollment possession proof configuration is invalid.');
  }
  return createHmac('sha256', input.secret)
    .update(PROOF_VERSION + '\0')
    .update(input.rawNonce)
    .digest('hex');
}

export function serializePortOnePreenrollmentCookieV1(rawNonce: string): string {
  if (!NONCE_PATTERN.test(rawNonce)) throw new Error('Preenrollment nonce is invalid.');
  return `${PORTONE_PREENROLLMENT_AGE_AUTHORITY_V1.cookieName}=${rawNonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Strict`;
}

export function extractPortOnePreenrollmentCookieV1(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (header === null || header.length > 8192) return null;
  let found: string | null = null;
  for (const part of header.split(';')) {
    const token = part.trim();
    if (!token.startsWith(PORTONE_PREENROLLMENT_AGE_AUTHORITY_V1.cookieName + '=')) continue;
    if (found !== null) return null;
    const candidate = token.slice(PORTONE_PREENROLLMENT_AGE_AUTHORITY_V1.cookieName.length + 1);
    if (!NONCE_PATTERN.test(candidate)) return null;
    found = candidate;
  }
  return found;
}

function requireDigest(value: string): void {
  if (!DIGEST_PATTERN.test(value)) throw new Error('Preenrollment digest is invalid.');
}

async function withRole<T>(pool: PostgresSubjectPoolV1,
  execute: (db: PostgresTransactionQueryV1) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  let begun = false;
  let badRelease: unknown;
  try {
    await db.query('BEGIN');
    begun = true;
    await db.query('SET LOCAL ROLE myeongha_api_executor');
    const result = await execute(db);
    await db.query('COMMIT');
    begun = false;
    return result;
  } catch (cause) {
    if (begun) {
      try { await db.query('ROLLBACK'); }
      catch (rollbackError) {
        badRelease = rollbackError;
        throw new AggregateError([cause, rollbackError], 'Preenrollment rollback failed.');
      }
    }
    throw cause;
  } finally {
    db.release(badRelease);
  }
}

/**
 * Narrow proposal-only SQL adapter: one short DB transaction for each action.
 * No HTTP route or provider SDK/network is attached here. A caller may mark
 * a proof verified ONLY after its own trusted PortOne server lookup succeeds.
 */
export function createPostgresPortOnePreenrollmentAgeAuthorityV1(pool: PostgresSubjectPoolV1) {
  return Object.freeze({
    async issue(bindingDigest: string): Promise<PortOnePreenrollmentIssuedAttemptV1> {
      requireDigest(bindingDigest);
      return withRole(pool, async db => {
        const { rows } = await db.query<IssuedRow>(
          'select identity_verification_id as "identityVerificationId", expires_at::text as "expiresAt" from public.cmd_issue_legal_portone_preenrollment_v1($1::text)',
          [bindingDigest],
        );
        const row = rows[0];
        if (rows.length !== 1 || !row || typeof row.identityVerificationId !== 'string' ||
            !ATTEMPT_PATTERN.test(row.identityVerificationId) ||
            typeof row.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(row.expiresAt))) {
          throw new Error('Preenrollment issue authority returned malformed output.');
        }
        return Object.freeze({
          identityVerificationId: row.identityVerificationId,
          expiresAt: new Date(row.expiresAt).toISOString(),
        });
      });
    },
    async readPending(bindingDigest: string, id: string): Promise<boolean> {
      requireDigest(bindingDigest);
      if (!ATTEMPT_PATTERN.test(id)) return false;
      return withRole(pool, async db => {
        const { rows } = await db.query<BooleanRow>(
          'select public.qry_pending_legal_portone_preenrollment_v1($1::text,$2::text) as "accepted"',
          [bindingDigest, id],
        );
        if (rows.length !== 1 || typeof rows[0]?.accepted !== 'boolean') {
          throw new Error('Preenrollment read authority returned malformed output.');
        }
        return rows[0].accepted;
      });
    },
    async recordVerified(bindingDigest: string, id: string, band: AgeBand): Promise<boolean> {
      requireDigest(bindingDigest);
      if (!ATTEMPT_PATTERN.test(id) || (band !== 'adult' && band !== 'free_minor')) {
        throw new Error('Preenrollment verified result is invalid.');
      }
      return withRole(pool, async db => {
        const { rows } = await db.query<BooleanRow>(
          'select public.cmd_verify_legal_portone_preenrollment_v1($1::text,$2::text,$3::text) as "accepted"',
          [bindingDigest, id, band],
        );
        if (rows.length !== 1 || typeof rows[0]?.accepted !== 'boolean') {
          throw new Error('Preenrollment verify authority returned malformed output.');
        }
        return rows[0].accepted;
      });
    },
    async consume(bindingDigest: string): Promise<AgeBand | null> {
      requireDigest(bindingDigest);
      return withRole(pool, async db => {
        const { rows } = await db.query<BandRow>(
          'select public.cmd_consume_legal_portone_preenrollment_v1($1::text) as "ageBand"',
          [bindingDigest],
        );
        if (rows.length !== 1) throw new Error('Preenrollment consume authority returned malformed output.');
        const band = rows[0]?.ageBand;
        if (band === null || band === undefined) return null;
        if (band !== 'adult' && band !== 'free_minor') {
          throw new Error('Preenrollment consume authority returned an invalid age band.');
        }
        return band;
      });
    },
  });
}
