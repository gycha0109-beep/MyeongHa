import type { SharedFaceObservationBundleV3 } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

/**
 * Current Bejewely/Visually source authority observed in gycha0109-beep/K_beauty.
 *
 * IMPORTANT:
 * `synthetic-observation-object-v1` is an evaluation/tooling contract. It is not
 * treated as a production FaceLab runtime API. This descriptor exists so that
 * MyeongHa can track compatibility without coupling production runtime to it.
 */
export const FACELAB_OBSERVED_CONTRACT_V0 = Object.freeze({
  repository: 'gycha0109-beep/K_beauty',
  packageName: '@bejewely/face-contracts',
  canonicalObservationProfileId: 'bejewely-canonical-vision-v1',
  canonicalObservationProfileVersion: '1.0.0',
  observationObjectSchemaVersion: 'synthetic-observation-object-v1',
  observationRunSchemaVersion: 'synthetic-observation-run-v1',
  canonicalImageTransformPolicyVersion: 'canonical-image-v1',
  sourceAuthorityClass: 'evaluation_tooling_contract',
} as const);

export type FaceLabCompatibilityState =
  | 'production_neutral_contract_available'
  | 'evaluation_contract_only'
  | 'incompatible';

export interface FaceLabCompatibilityReport {
  readonly state: FaceLabCompatibilityState;
  readonly reusableInvariants: readonly string[];
  readonly missingProductionCapabilities: readonly string[];
  readonly forbiddenCouplings: readonly string[];
}

export const FACELAB_COMPATIBILITY_REPORT_V0: FaceLabCompatibilityReport = Object.freeze({
  state: 'evaluation_contract_only',
  reusableInvariants: Object.freeze([
    'versioned observation contract/profile',
    'canonical image transform policy is pinned',
    'candidate asset is content-addressed by sha256',
    'source image persistence must be explicitly false for blind judgment input',
    'raw provider response persistence must be explicitly false for blind judgment input',
    'provider execution mode/model is bounded by the observation profile',
    'observation digest is bound to the canonical candidate asset and contract snapshot',
  ]),
  missingProductionCapabilities: Object.freeze([
    'stable exported production-neutral FaceLab observation schema',
    'versioned geometry metric list suitable for physiognomy operationalization',
    'landmark provenance for each metric',
    'pose and occlusion fields with production semantics',
    'section-level usability/availability contract',
    'explicit separation of static geometry from dynamic color/appearance observations',
  ]),
  forbiddenCouplings: Object.freeze([
    'MyeongHa production runtime importing synthetic-observation-object-v1 as its production FaceLab API',
    'FaceLab archetype or style outputs becoming physiognomy evidence',
    'synthetic evaluation candidate identifiers becoming MyeongHa user identity keys',
    'provider model output becoming direct Face Reading semantic authority',
  ]),
});

/**
 * Future production bridge contract. A provider-side FaceLab adapter may supply
 * this only after FaceLab publishes a stable neutral observation schema.
 *
 * MyeongHa deliberately owns this consumer contract instead of importing
 * synthetic evaluation schemas into production.
 */
export interface FaceLabNeutralObservationProvider {
  readonly providerKey: 'visually_facelab';
  readonly providerContractVersion: string;
  getObservation(input: {
    readonly sourceRef: string;
    readonly requestId: string;
  }): Promise<SharedFaceObservationBundleV3>;
}

export function assertFaceLabProductionBridgeReady(
  report: FaceLabCompatibilityReport = FACELAB_COMPATIBILITY_REPORT_V0,
): void {
  if (report.state !== 'production_neutral_contract_available') {
    throw new FaceAuthorityValidationError(
      `FaceLab production bridge is blocked: compatibility state=${report.state}.`,
    );
  }
}
