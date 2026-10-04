import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredPurposeV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_STRUCTURED_PROVIDER_TELEMETRY_VERSION_V1 =
  'seyeon-structured-provider-telemetry-v1' as const;

const PURPOSES: readonly SeyeonStructuredPurposeV2[] = Object.freeze([
  'integrity_classification',
  'disclosure_classification',
  'turn_interpretation',
  'dialogue_render',
  'semantic_review',
  'event_extraction',
]);

export interface SeyeonStructuredProviderTelemetrySnapshotV1 {
  readonly version: typeof SEYEON_STRUCTURED_PROVIDER_TELEMETRY_VERSION_V1;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly totalCalls: number;
  readonly totalSucceeded: number;
  readonly totalFailed: number;
  readonly callsByPurpose: Readonly<Record<SeyeonStructuredPurposeV2, number>>;
  readonly failuresByPurpose: Readonly<Record<SeyeonStructuredPurposeV2, number>>;
}

export interface ObservedSeyeonStructuredProviderV1 {
  readonly provider: SeyeonStructuredProviderPortV2;
  snapshot(): SeyeonStructuredProviderTelemetrySnapshotV1;
}

function zeroPurposeRecord(): Record<SeyeonStructuredPurposeV2, number> {
  return {
    integrity_classification: 0,
    disclosure_classification: 0,
    turn_interpretation: 0,
    dialogue_render: 0,
    semantic_review: 0,
    event_extraction: 0,
  };
}

function frozenPurposeRecord(
  source: Readonly<Record<SeyeonStructuredPurposeV2, number>>,
): Readonly<Record<SeyeonStructuredPurposeV2, number>> {
  const copy = zeroPurposeRecord();
  for (const purpose of PURPOSES) copy[purpose] = source[purpose];
  return Object.freeze(copy);
}

export function observeSeyeonStructuredProviderV1(
  source: SeyeonStructuredProviderPortV2,
): ObservedSeyeonStructuredProviderV1 {
  const callsByPurpose = zeroPurposeRecord();
  const failuresByPurpose = zeroPurposeRecord();
  let totalCalls = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  const provider: SeyeonStructuredProviderPortV2 = Object.freeze({
    providerKey: source.providerKey,
    modelKey: source.modelKey,
    async generate(request) {
      totalCalls += 1;
      callsByPurpose[request.purpose] += 1;
      try {
        const result = await source.generate(request);
        totalSucceeded += 1;
        return result;
      } catch (error) {
        totalFailed += 1;
        failuresByPurpose[request.purpose] += 1;
        throw error;
      }
    },
  });

  return Object.freeze({
    provider,
    snapshot() {
      return Object.freeze({
        version: SEYEON_STRUCTURED_PROVIDER_TELEMETRY_VERSION_V1,
        providerKey: source.providerKey,
        modelKey: source.modelKey,
        totalCalls,
        totalSucceeded,
        totalFailed,
        callsByPurpose: frozenPurposeRecord(callsByPurpose),
        failuresByPurpose: frozenPurposeRecord(failuresByPurpose),
      });
    },
  });
}
