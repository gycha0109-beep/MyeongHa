import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ALLOWED_KINDS = new Set(['subject', 'birth_profile', 'birth_revision']);
const AUDIT_DOMAIN = 'myeongha:production-saju-guest-smoke:fixture-audit:v1';
export const PRODUCTION_SAJU_GUEST_BIRTH_LABEL_PREFIX = 'production-saju-guest-smoke-v1';

export function requireProductionSajuGuestRunId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(value)) {
    throw new Error('GITHUB_RUN_ID is required to correlate the single Production Guest fixture.');
  }
  return value;
}

export function buildProductionSajuGuestBirthLabel(runId) {
  return `${PRODUCTION_SAJU_GUEST_BIRTH_LABEL_PREFIX}-run-${requireProductionSajuGuestRunId(runId)}`;
}

/**
 * Redacted, domain-separated correlation hint for a *synthetic* UUID only.
 * Not a deletion authorization, secrecy boundary, or independent DB proof.
 */
export function fingerprintProductionSajuGuestFixture(kind, id) {
  if (!ALLOWED_KINDS.has(kind) || typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new Error('Production Guest fixture audit input is invalid.');
  }
  return `sha256:${createHash('sha256')
    .update(`${AUDIT_DOMAIN}\0${kind}\0${id.toLowerCase()}`, 'utf8')
    .digest('hex')
    .slice(0, 24)}`;
}
