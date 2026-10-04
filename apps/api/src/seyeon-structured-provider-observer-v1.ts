import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderPurposeV2,
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_STRUCTURED_PROVIDER_OBSERVER_VERSION_V1 =
  'seyeon-structured-provider-observer-v1' as const;

export const SEYEON_STRUCTURED_PROVIDER_PURPOSES_V1 = Object.freeze([
  'integrity_classification',
  'disclosure_classification',
  'turn_interpretation',
  'dialogue_render',
  'semantic_review',
  'event_extraction',
] as const satisfies readonly SeyeonStructuredProviderPurposeV2[]);

export interface SeyeonStructuredProviderInvocationSnapshotV1 {
  readonly version: typeof SEYEON_STRUCTURED_PROVIDER_OBSERVER_VERSION_V1;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly total: number;
  readonly byPurpose: Readonly<Record<SeyeonStructuredProviderPurposeV2, number>>;
}

export interface ObservedSeyeonStructuredProviderV1 {
  readonly provider: SeyeonStructuredProviderPortV2;
  snapshot(): SeyeonStructuredProviderInvocationSnapshotV1;
}

function zeroPurposeCounts():
  Record<SeyeonStructuredProviderPurposeV2, number> {
  return {
    integrity_classification: 0,
    disclosure_classification: 0,
    turn_interpretation: 0,
    dialogue_render: 0,
    semantic_review: 0,
    event_extraction: 0,
  };
}

export function createObservedSeyeonStructuredProviderV1(
  delegate: SeyeonStructuredProviderPortV2,
): ObservedSeyeonStructuredProviderV1 {
  const counts = zeroPurposeCounts();
  let total = 0;

  const provider: SeyeonStructuredProviderPortV2 = Object.freeze({
    providerKey: delegate.providerKey,
    modelKey: delegate.modelKey,
    async generate(
      request: SeyeonStructuredProviderRequestV2,
    ): Promise<unknown> {
      total += 1;
      counts[request.purpose] += 1;
      return await delegate.generate(request);
    },
  });

  return Object.freeze({
    provider,
    snapshot(): SeyeonStructuredProviderInvocationSnapshotV1 {
      return Object.freeze({
        version: SEYEON_STRUCTURED_PROVIDER_OBSERVER_VERSION_V1,
        providerKey: delegate.providerKey,
        modelKey: delegate.modelKey,
        total,
        byPurpose: Object.freeze({ ...counts }),
      });
    },
  });
}

export function diffSeyeonStructuredProviderInvocationsV1(
  before: SeyeonStructuredProviderInvocationSnapshotV1,
  after: SeyeonStructuredProviderInvocationSnapshotV1,
): SeyeonStructuredProviderInvocationSnapshotV1 {
  const byPurpose = zeroPurposeCounts();
  for (const purpose of SEYEON_STRUCTURED_PROVIDER_PURPOSES_V1) {
    byPurpose[purpose] =
      after.byPurpose[purpose] - before.byPurpose[purpose];
  }

  return Object.freeze({
    version: SEYEON_STRUCTURED_PROVIDER_OBSERVER_VERSION_V1,
    providerKey: after.providerKey,
    modelKey: after.modelKey,
    total: after.total - before.total,
    byPurpose: Object.freeze(byPurpose),
  });
}
