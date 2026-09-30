import type {
  CharacterRuntimeClaimIntegrityInputV1,
  CharacterRuntimeDisclosureDepthV1,
  CharacterRuntimeDisclosureIneligibleResultV1,
  CharacterRuntimeDisclosureRelationshipStageV1,
  CharacterRuntimeDisclosureResultV1,
  CharacterRuntimeDisclosureTrustBandV1,
  CharacterRuntimeIntegrityResultV1,
} from '../../../packages/domain/src/index.js';
import {
  prepareCharacterRuntimeFactAccessV1,
  type CharacterRuntimeFactContentReadAuthorityPortV1,
  type CharacterRuntimeFactMetadataReadAuthorityPortV1,
} from './character-runtime-fact-authority.js';

export interface CharacterRuntimeFactPacketRequestV1 {
  readonly factKey: string;
  readonly claim?: CharacterRuntimeClaimIntegrityInputV1;
  readonly relationshipStage: CharacterRuntimeDisclosureRelationshipStageV1;
  readonly trustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly minimumTrustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly contextualEligibility: boolean;
  readonly characterSpecificBoundaryAllows: boolean;
  readonly requestedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly previouslyDisclosedDepth?: CharacterRuntimeDisclosureDepthV1;
  readonly ineligibleResult: CharacterRuntimeDisclosureIneligibleResultV1;
}

export type CharacterRuntimeFactRendererEntryV1 =
  | {
      readonly factKey: string;
      readonly accessStatus: 'knowledge_unavailable';
      readonly claimIntegrityResult: CharacterRuntimeIntegrityResultV1 | null;
      readonly disclosureResult: null;
    }
  | {
      readonly factKey: string;
      readonly accessStatus: 'not_retrieved';
      readonly claimIntegrityResult: CharacterRuntimeIntegrityResultV1 | null;
      readonly disclosureResult: CharacterRuntimeDisclosureResultV1;
    }
  | {
      readonly factKey: string;
      readonly accessStatus: 'retrieved';
      readonly claimIntegrityResult: CharacterRuntimeIntegrityResultV1 | null;
      readonly disclosureResult: 'ALLOW' | 'PARTIAL';
      readonly depth: CharacterRuntimeDisclosureDepthV1;
      readonly value: unknown;
    };

export interface CharacterRuntimeFactRendererPacketV1 {
  readonly schemaVersion: 'v1';
  readonly characterId: string;
  readonly entries: readonly CharacterRuntimeFactRendererEntryV1[];
}

export interface CharacterRuntimeFactAuditEntryV1 {
  readonly factKey: string;
  readonly accessStatus:
    | 'knowledge_unavailable'
    | 'not_retrieved'
    | 'retrieved';
  readonly sourceSection: string;
  readonly sourceRevision: string;
  readonly authorizedDepth: CharacterRuntimeDisclosureDepthV1 | null;
}

export interface CharacterRuntimeFactPacketPlanV1 {
  readonly rendererPacket: CharacterRuntimeFactRendererPacketV1;
  readonly auditEntries: readonly CharacterRuntimeFactAuditEntryV1[];
}

export interface PrepareCharacterRuntimeFactPacketInputV1 {
  readonly characterId: string;
  readonly requests: readonly CharacterRuntimeFactPacketRequestV1[];
  readonly metadataAuthorityPort: CharacterRuntimeFactMetadataReadAuthorityPortV1;
  readonly contentAuthorityPort: CharacterRuntimeFactContentReadAuthorityPortV1;
}

export type CharacterRuntimeFactPacketErrorCodeV1 =
  | 'INVALID_CHARACTER_ID'
  | 'DUPLICATE_FACT_KEY'
  | 'INVALID_RETRIEVED_DISCLOSURE_RESULT';

export class CharacterRuntimeFactPacketErrorV1 extends Error {
  override readonly name = 'CharacterRuntimeFactPacketErrorV1';

  constructor(
    readonly code: CharacterRuntimeFactPacketErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function requiredCharacterId(value: string): string {
  const characterId = value.trim();
  if (characterId.length === 0 || characterId.length > 128) {
    throw new CharacterRuntimeFactPacketErrorV1(
      'INVALID_CHARACTER_ID',
      'characterId is outside the supported bounds.',
    );
  }
  return characterId;
}

function assertUniqueFactKeys(
  requests: readonly CharacterRuntimeFactPacketRequestV1[],
): void {
  const seen = new Set<string>();
  for (const request of requests) {
    const factKey = request.factKey.trim();
    if (seen.has(factKey)) {
      throw new CharacterRuntimeFactPacketErrorV1(
        'DUPLICATE_FACT_KEY',
        `Duplicate Character fact packet request: ${factKey}`,
      );
    }
    seen.add(factKey);
  }
}

/**
 * Server-only renderer packet projection.
 *
 * Authority/provenance metadata remains in auditEntries. The renderer packet gets
 * only the minimum directive and any value that survived two-phase fact access.
 */
export async function prepareCharacterRuntimeFactPacketV1(
  input: PrepareCharacterRuntimeFactPacketInputV1,
): Promise<CharacterRuntimeFactPacketPlanV1> {
  const characterId = requiredCharacterId(input.characterId);
  assertUniqueFactKeys(input.requests);

  const rendererEntries: CharacterRuntimeFactRendererEntryV1[] = [];
  const auditEntries: CharacterRuntimeFactAuditEntryV1[] = [];

  for (const request of input.requests) {
    const access = await prepareCharacterRuntimeFactAccessV1({
      characterId,
      factKey: request.factKey,
      ...(request.claim === undefined ? {} : { claim: request.claim }),
      relationshipStage: request.relationshipStage,
      trustBand: request.trustBand,
      minimumTrustBand: request.minimumTrustBand,
      contextualEligibility: request.contextualEligibility,
      characterSpecificBoundaryAllows: request.characterSpecificBoundaryAllows,
      requestedDepth: request.requestedDepth,
      ...(request.previouslyDisclosedDepth === undefined
        ? {}
        : { previouslyDisclosedDepth: request.previouslyDisclosedDepth }),
      ineligibleResult: request.ineligibleResult,
      metadataAuthorityPort: input.metadataAuthorityPort,
      contentAuthorityPort: input.contentAuthorityPort,
    });

    const claimIntegrityResult =
      access.preflight?.claimIntegrity?.result ?? null;

    if (access.status === 'knowledge_unavailable') {
      rendererEntries.push(
        Object.freeze({
          factKey: access.metadata.factKey,
          accessStatus: 'knowledge_unavailable' as const,
          claimIntegrityResult,
          disclosureResult: null,
        }),
      );
      auditEntries.push(
        Object.freeze({
          factKey: access.metadata.factKey,
          accessStatus: access.status,
          sourceSection: access.metadata.sourceSection,
          sourceRevision: access.metadata.sourceRevision,
          authorizedDepth: null,
        }),
      );
      continue;
    }

    if (access.status === 'not_retrieved') {
      rendererEntries.push(
        Object.freeze({
          factKey: access.metadata.factKey,
          accessStatus: 'not_retrieved' as const,
          claimIntegrityResult,
          disclosureResult: access.preflight.disclosure.result,
        }),
      );
      auditEntries.push(
        Object.freeze({
          factKey: access.metadata.factKey,
          accessStatus: access.status,
          sourceSection: access.metadata.sourceSection,
          sourceRevision: access.metadata.sourceRevision,
          authorizedDepth: null,
        }),
      );
      continue;
    }

    const disclosureResult = access.preflight.disclosure.result;
    if (disclosureResult !== 'ALLOW' && disclosureResult !== 'PARTIAL') {
      throw new CharacterRuntimeFactPacketErrorV1(
        'INVALID_RETRIEVED_DISCLOSURE_RESULT',
        'Retrieved Character fact content must be backed by ALLOW or PARTIAL disclosure.',
      );
    }

    rendererEntries.push(
      Object.freeze({
        factKey: access.metadata.factKey,
        accessStatus: 'retrieved' as const,
        claimIntegrityResult,
        disclosureResult,
        depth: access.content.depth,
        value: access.content.value,
      }),
    );
    auditEntries.push(
      Object.freeze({
        factKey: access.metadata.factKey,
        accessStatus: access.status,
        sourceSection: access.content.sourceSection,
        sourceRevision: access.content.sourceRevision,
        authorizedDepth: access.content.depth,
      }),
    );
  }

  return Object.freeze({
    rendererPacket: Object.freeze({
      schemaVersion: 'v1' as const,
      characterId,
      entries: Object.freeze(rendererEntries),
    }),
    auditEntries: Object.freeze(auditEntries),
  });
}
