import { FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16 } from './provider-adapter-evidence-fr16.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface NeutralDerivationEvidenceRecordV1 {
  readonly evidenceRef: string;
  readonly sourceClass: 'merged_fr16_authority' | 'kbeauty_runtime_inspection';
  readonly sourceRef: string;
  readonly observedValue: string;
  readonly authorityState: 'research_only';
  readonly limitations: readonly string[];
}

const FR16_MANIFEST_REF = `face-provider-adapter-evidence-fr16@${FACELAB_PROVIDER_ADAPTER_EVIDENCE_FR16.manifestVersion}`;

export const FR17_NEUTRAL_DERIVATION_EVIDENCE: readonly NeutralDerivationEvidenceRecordV1[] = Object.freeze([
  Object.freeze({
    evidenceRef: 'evidence.fr17.fr16.topology_structure',
    sourceClass: 'merged_fr16_authority' as const,
    sourceRef: `${FR16_MANIFEST_REF}#topologySourceEvidence`,
    observedValue: 'MediaPipe upstream structure witness classifies eye as closed cycles, eyebrows as disconnected open chains, and nose as a branched graph.',
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'FR-16 explicitly does not attest the upstream master topology as release-exact for @mediapipe/tasks-vision@0.10.35.',
      'Provider topology is neutral observation research evidence, not traditional physiognomy semantics.',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr17.kbeauty.face_observation_contract',
    sourceClass: 'kbeauty_runtime_inspection' as const,
    sourceRef: 'gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:lib/face-lab-observation-contract.js#blob=94315afc85f35e6bee3a5ea149895c875ed9d25a',
    observedValue: 'Current FaceLab observation contract exposes bounded qualitative enums for outline, vertical balance, eyes, feature layout, visual language, and color appearance; it does not expose landmark coordinates or neutral brow/nose geometry derivations.',
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'Absence is scoped to the inspected contract at the pinned K_beauty commit.',
      'The qualitative observations must not be reverse-engineered into landmark geometry.',
    ]),
  }),
  Object.freeze({
    evidenceRef: 'evidence.fr17.kbeauty.unified_runtime_provider',
    sourceClass: 'kbeauty_runtime_inspection' as const,
    sourceRef: 'gycha0109-beep/K_beauty@81c3b4139efdffc785439da005557dc38a6b4873:lib/server/vision-observation-service.js#blob=092ce10986475d05e3dd1e95d537a538496fa3ea',
    observedValue: 'Current unified vision runtime calls OpenAI chat completions with an image and normalizes the returned qualitative vision observation bundle; it does not execute MediaPipe FaceLandmarker geometry in this inspected runtime path.',
    authorityState: 'research_only' as const,
    limitations: Object.freeze([
      'This proves the inspected canonical unified runtime path, not the non-existence of every MediaPipe experiment elsewhere in K_beauty.',
      'The presence of @mediapipe/tasks-vision in package.json does not by itself establish runtime geometry authority.',
    ]),
  }),
] as const);

const ALLOWED_RECORD_KEYS = new Set([
  'evidenceRef', 'sourceClass', 'sourceRef', 'observedValue', 'authorityState', 'limitations',
]);

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

export function validateNeutralDerivationEvidenceFR17(
  records: readonly NeutralDerivationEvidenceRecordV1[] = FR17_NEUTRAL_DERIVATION_EVIDENCE,
): readonly NeutralDerivationEvidenceRecordV1[] {
  const refs = new Set<string>();
  for (const record of records) {
    exactKeys(record, ALLOWED_RECORD_KEYS, `FR-17 evidence ${record.evidenceRef}`);
    nonEmpty(record.evidenceRef, 'fr17.evidenceRef');
    nonEmpty(record.sourceRef, `fr17.${record.evidenceRef}.sourceRef`);
    nonEmpty(record.observedValue, `fr17.${record.evidenceRef}.observedValue`);
    if (record.authorityState !== 'research_only') {
      throw new FaceAuthorityValidationError(`FR-17 evidence must remain research_only: ${record.evidenceRef}`);
    }
    if (record.limitations.length === 0) {
      throw new FaceAuthorityValidationError(`FR-17 evidence requires limitations: ${record.evidenceRef}`);
    }
    if (refs.has(record.evidenceRef)) throw new FaceAuthorityValidationError(`FR-17 duplicate evidenceRef: ${record.evidenceRef}`);
    refs.add(record.evidenceRef);
  }
  return records;
}

export function assertNeutralDerivationEvidenceRefsFR17(refs: readonly string[]): void {
  validateNeutralDerivationEvidenceFR17();
  const known = new Set(FR17_NEUTRAL_DERIVATION_EVIDENCE.map((record) => record.evidenceRef));
  for (const ref of refs) {
    if (!known.has(ref)) throw new FaceAuthorityValidationError(`FR-17 unresolved derivation evidenceRef: ${ref}`);
  }
}
