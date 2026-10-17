import type {
  CharacterGovernedPreflightResultV1,
} from './character-governed-preflight-v1.js';
import {
  CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1,
} from './character-governed-preflight-v1.js';
import {
  CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2,
} from './character-disclosure-preflight-v2.js';

/**
 * S3/G1 source-closure safety seam. The zero-source DB Pin precedes governed
 * Preflight, whose private retriever can introduce NEW content not covered by
 * that Pin. No positive/derived source authority or post-Preflight DB receipt
 * is approved yet; reject the additional ingress BEFORE interpreter/render.
 *
 * This check is not a DB Pin, Grant validation, or Reveal authorization.
 */
export const SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1 =
  'seyeon-preflight-source-closure-hold-v1' as const;

export class SeyeonPreflightSourceClosureHoldV1 extends Error {
  readonly code = 'PREFLIGHT_PRIVATE_SOURCE_PIN_UNAVAILABLE' as const;

  constructor() {
    super('Se-yeon governed Preflight private-source authorization is unavailable.');
    this.name = 'SeyeonPreflightSourceClosureHoldV1';
  }
}

export function assertSeyeonPreflightZeroPrivateSourceClosureV1(
  preflight: CharacterGovernedPreflightResultV1,
): Readonly<{
  version: typeof SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1;
  sourceState: 'explicit_zero_private_retrieval';
  permitsPositiveSourcePin: false;
  permitsHttpReveal: false;
}> {
  if (
    preflight === null || typeof preflight !== 'object' ||
    preflight.schemaVersion !== CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1 ||
    preflight.disclosure === null ||
    typeof preflight.disclosure !== 'object' ||
    preflight.disclosure.schemaVersion !== CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2 ||
    !Array.isArray(preflight.retrievedPrivateSources) ||
    preflight.retrievedPrivateSources.length !== 0
  ) {
    throw new SeyeonPreflightSourceClosureHoldV1();
  }

  return Object.freeze({
    version: SEYEON_PREFLIGHT_SOURCE_CLOSURE_HOLD_VERSION_V1,
    sourceState: 'explicit_zero_private_retrieval' as const,
    permitsPositiveSourcePin: false as const,
    permitsHttpReveal: false as const,
  });
}
