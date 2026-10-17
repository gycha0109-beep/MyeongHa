/**
 * G0/G3 FIRST HTTP REVEAL — fail-closed admission before any metered Provider
 * or committed-turn work. A durable zero-source Pin, an old Commit, and
 * possession of a Member session are NOT evidence of a current, original
 * Grant/Record plus derived-lineage Reveal decision.
 *
 * This interlock does NOT grant permission, even for synthetic/zero-source
 * responses. Removing it requires a DB-owner-backed current-rights and
 * revoke↔reveal linearization contract plus HTTP boundary tests.
 */
export const SEYEON_FIRST_HTTP_REVEAL_HOLD_VERSION_V1 =
  'seyeon-first-http-reveal-hold-v1' as const;

export class SeyeonFirstHttpRevealHoldV1 extends Error {
  readonly code = 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' as const;

  constructor() {
    super('Se-yeon first HTTP Reveal requires current source authorization.');
    this.name = 'SeyeonFirstHttpRevealHoldV1';
  }
}

/** Must be checked for EVERY syntactically valid authenticated Se-yeon POST. */
export function assertSeyeonFirstHttpRevealAuthorizedV1(): void {
  throw new SeyeonFirstHttpRevealHoldV1();
}
