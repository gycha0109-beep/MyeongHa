import {
  SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from './seyeon-production-context-v1.js';

/**
 * R0/G1: Production cannot enter a positive personal-record lane until
 * SRC-25, exact Grant/Record DB Pin, same-transaction Commit and Reveal
 * contracts have all been separately approved and implemented.
 *
 * Zero-only readiness is not authority to register a positive Projector.
 * An operator-side environment toggle or a developer adding one to the
 * exported array must not silently make the runtime read private material.
 */
export const SEYEON_POSITIVE_PROJECTOR_ADMISSION_HOLD_VERSION_V1 =
  'seyeon-positive-projector-admission-hold-v1' as const;

export class SeyeonPositiveProjectorAdmissionHoldV1 extends Error {
  readonly code = 'SEYEON_POSITIVE_PROJECTOR_OWNER_APPROVAL_REQUIRED' as const;

  constructor() {
    super('Production personal-record Projectors require G0/G1 DB and source-owner approval.');
    this.name = 'SeyeonPositiveProjectorAdmissionHoldV1';
  }
}

/** Call before allocating/using Production DB or any metered Provider. */
export function assertSeyeonPositiveProjectorsNotEnabledV1(
  configuredProjectors: readonly SeyeonProductionPersonalRecordProjectorV1[] =
    SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
): void {
  if (!Array.isArray(configuredProjectors) || configuredProjectors.length !== 0) {
    throw new SeyeonPositiveProjectorAdmissionHoldV1();
  }
}
