import {
  resolveCharacterRuntimeSensitiveTopicPreflightV1,
  type CharacterRuntimeClaimIntegrityInputV1,
  type CharacterRuntimeDisclosureDepthV1,
  type CharacterRuntimeDisclosureGateV1,
  type CharacterRuntimeDisclosureIneligibleResultV1,
  type CharacterRuntimeDisclosureRelationshipStageV1,
  type CharacterRuntimeDisclosureTrustBandV1,
  type CharacterRuntimeSensitiveTopicPreflightV1,
  type CharacterRuntimeSourceAuthorityStateV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_RUNTIME_FACT_KNOWLEDGE_STATES_V1 = [
  'KNOWN',
  'PARTIAL',
  'UNKNOWN_TO_CHARACTER',
  'NOT_APPLICABLE',
] as const;

export type CharacterRuntimeFactKnowledgeStateV1 =
  (typeof CHARACTER_RUNTIME_FACT_KNOWLEDGE_STATES_V1)[number];

export interface CharacterRuntimeFactMetadataAuthorityRowV1 {
  readonly characterId: string;
  readonly factKey: string;
  readonly sourceAuthorityState: CharacterRuntimeSourceAuthorityStateV1;
  readonly characterKnowledge: CharacterRuntimeFactKnowledgeStateV1;
  readonly disclosureDefault: CharacterRuntimeDisclosureGateV1;
  readonly allowedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly sourceSection: string;
  readonly sourceRevision: string;
}

export interface CharacterRuntimeFactContentAuthorityRowV1 {
  readonly characterId: string;
  readonly factKey: string;
  readonly depth: CharacterRuntimeDisclosureDepthV1;
  readonly value: unknown;
  readonly sourceSection: string;
  readonly sourceRevision: string;
}

export interface CharacterRuntimeFactMetadataReadAuthorityPortV1 {
  readFactMetadata(input: {
    readonly characterId: string;
    readonly factKey: string;
  }): Promise<CharacterRuntimeFactMetadataAuthorityRowV1 | null>;
}

export interface CharacterRuntimeFactContentReadAuthorityPortV1 {
  readFactContent(input: {
    readonly characterId: string;
    readonly factKey: string;
    readonly depth: CharacterRuntimeDisclosureDepthV1;
  }): Promise<CharacterRuntimeFactContentAuthorityRowV1 | null>;
}

export type CharacterRuntimeFactAccessErrorCodeV1 =
  | 'INVALID_INPUT'
  | 'FACT_METADATA_UNAVAILABLE'
  | 'FACT_METADATA_IDENTITY_MISMATCH'
  | 'FACT_METADATA_PROVENANCE_INVALID'
  | 'FACT_CONTENT_UNAVAILABLE'
  | 'FACT_CONTENT_IDENTITY_MISMATCH'
  | 'FACT_CONTENT_PROVENANCE_MISMATCH'
  | 'FACT_CONTENT_DEPTH_MISMATCH';

export class CharacterRuntimeFactAccessErrorV1 extends Error {
  override readonly name = 'CharacterRuntimeFactAccessErrorV1';

  constructor(
    readonly code: CharacterRuntimeFactAccessErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

export interface PrepareCharacterRuntimeFactAccessInputV1 {
  readonly characterId: unknown;
  readonly factKey: unknown;
  readonly claim?: CharacterRuntimeClaimIntegrityInputV1;
  /**
   * These inputs must already come from server-owned relationship / disclosure policy.
   * This seam does not derive them from client prose or guess stage mappings.
   */
  readonly relationshipStage: CharacterRuntimeDisclosureRelationshipStageV1;
  readonly trustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly minimumTrustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly contextualEligibility: boolean;
  readonly characterSpecificBoundaryAllows: boolean;
  readonly requestedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly previouslyDisclosedDepth?: CharacterRuntimeDisclosureDepthV1;
  readonly ineligibleResult: CharacterRuntimeDisclosureIneligibleResultV1;
  readonly metadataAuthorityPort: CharacterRuntimeFactMetadataReadAuthorityPortV1;
  readonly contentAuthorityPort: CharacterRuntimeFactContentReadAuthorityPortV1;
}

export type CharacterRuntimeFactAccessV1 =
  | {
      readonly status: 'knowledge_unavailable';
      readonly metadata: CharacterRuntimeFactMetadataAuthorityRowV1;
      readonly preflight: null;
      readonly content: null;
    }
  | {
      readonly status: 'not_retrieved';
      readonly metadata: CharacterRuntimeFactMetadataAuthorityRowV1;
      readonly preflight: CharacterRuntimeSensitiveTopicPreflightV1;
      readonly content: null;
    }
  | {
      readonly status: 'retrieved';
      readonly metadata: CharacterRuntimeFactMetadataAuthorityRowV1;
      readonly preflight: CharacterRuntimeSensitiveTopicPreflightV1;
      readonly content: CharacterRuntimeFactContentAuthorityRowV1;
    };

function requiredIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new CharacterRuntimeFactAccessErrorV1(
      'INVALID_INPUT',
      `${path} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'INVALID_INPUT',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function assertMetadataProvenance(
  metadata: CharacterRuntimeFactMetadataAuthorityRowV1,
): void {
  if (
    metadata.sourceSection.trim().length === 0 ||
    metadata.sourceRevision.trim().length === 0
  ) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_METADATA_PROVENANCE_INVALID',
      'Character fact metadata must carry source section and revision provenance.',
    );
  }
}

function characterCanKnowFact(
  state: CharacterRuntimeFactKnowledgeStateV1,
): boolean {
  return state === 'KNOWN' || state === 'PARTIAL';
}

/**
 * Server-only two-phase Character fact access boundary.
 *
 * Phase 1 reads compact authority/disclosure metadata only.
 * Phase 2 reads fact content only when deterministic preflight returns a bounded
 * retrieval scope. No Character Bible/manifest implementation is assumed here.
 */
export async function prepareCharacterRuntimeFactAccessV1(
  input: PrepareCharacterRuntimeFactAccessInputV1,
): Promise<CharacterRuntimeFactAccessV1> {
  const characterId = requiredIdentifier(input.characterId, 'characterId');
  const factKey = requiredIdentifier(input.factKey, 'factKey');

  const metadata = await input.metadataAuthorityPort.readFactMetadata({
    characterId,
    factKey,
  });
  if (metadata === null) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_METADATA_UNAVAILABLE',
      'Character fact authority metadata is unavailable.',
    );
  }
  if (metadata.characterId !== characterId || metadata.factKey !== factKey) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_METADATA_IDENTITY_MISMATCH',
      'Character fact authority metadata does not match the requested identity.',
    );
  }
  assertMetadataProvenance(metadata);

  const frozenMetadata = Object.freeze({ ...metadata });

  if (!characterCanKnowFact(metadata.characterKnowledge)) {
    return Object.freeze({
      status: 'knowledge_unavailable',
      metadata: frozenMetadata,
      preflight: null,
      content: null,
    });
  }

  const disclosure = {
    topicKey: factKey,
    sourceAuthorityState: metadata.sourceAuthorityState,
    minimumDisclosureGate: metadata.disclosureDefault,
    relationshipStage: input.relationshipStage,
    trustBand: input.trustBand,
    minimumTrustBand: input.minimumTrustBand,
    contextualEligibility: input.contextualEligibility,
    characterSpecificBoundaryAllows: input.characterSpecificBoundaryAllows,
    requestedDepth: input.requestedDepth,
    allowedDepth: metadata.allowedDepth,
    ...(input.previouslyDisclosedDepth === undefined
      ? {}
      : { previouslyDisclosedDepth: input.previouslyDisclosedDepth }),
    ineligibleResult: input.ineligibleResult,
  } as const;

  const preflight = resolveCharacterRuntimeSensitiveTopicPreflightV1({
    ...(input.claim === undefined ? {} : { claim: input.claim }),
    disclosure,
  });

  if (preflight.disclosure.retrieval.scope === 'none') {
    return Object.freeze({
      status: 'not_retrieved',
      metadata: frozenMetadata,
      preflight,
      content: null,
    });
  }

  const requestedContentDepth = preflight.disclosure.retrieval.depth;
  const content = await input.contentAuthorityPort.readFactContent({
    characterId,
    factKey,
    depth: requestedContentDepth,
  });
  if (content === null) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_CONTENT_UNAVAILABLE',
      'Character fact content is unavailable for an authorized retrieval.',
    );
  }
  if (content.characterId !== characterId || content.factKey !== factKey) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_CONTENT_IDENTITY_MISMATCH',
      'Character fact content does not match the requested identity.',
    );
  }
  if (
    content.sourceSection !== metadata.sourceSection ||
    content.sourceRevision !== metadata.sourceRevision
  ) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_CONTENT_PROVENANCE_MISMATCH',
      'Character fact content provenance does not match the preflight metadata.',
    );
  }
  if (content.depth !== requestedContentDepth) {
    throw new CharacterRuntimeFactAccessErrorV1(
      'FACT_CONTENT_DEPTH_MISMATCH',
      'Character fact content depth does not match the authorized retrieval depth.',
    );
  }

  return Object.freeze({
    status: 'retrieved',
    metadata: frozenMetadata,
    preflight,
    content: Object.freeze({ ...content }),
  });
}
