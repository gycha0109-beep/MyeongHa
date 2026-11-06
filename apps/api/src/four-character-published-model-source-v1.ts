// Watchtower-Track: character-memory
// Connects the verified Member-owned PostgreSQL publication read with an exact
// immutable versioned artifact. No production artifact loader or canonical
// model compiler is installed by this module; absent authority stays HELD.
import { createHash } from 'node:crypto';
import { FOUR_CHARACTER_CHAT_MAX_CANONICAL_CONTEXT_UTF16_CODE_UNITS_V1 } from './four-character-chat-length-limits-v1.js';
import type {
  FourIndependentChatTargetV1,
  PublishedFourCharacterModelSourceV1,
  FourCharacterProductionExecutionPortsV1,
} from './four-character-production-chat-executor-v1.js';
import type {
  FourCharacterPublishedArtifactEvidencePortV1,
  FourCharacterPublishedArtifactEvidenceV1,
} from './postgres-four-character-publication-evidence-v1.js';
import {
  FourCharacterPublishedArtifactUnavailableV1,
} from './postgres-four-character-publication-evidence-v1.js';

export interface FourCharacterVerifiedSourceCompilerOutputV1 {
  readonly bibleSourceRef: string;
  readonly runtimeSourceRef: string;
  readonly canonicalContext: string;
}

export interface FourCharacterPublishedSourceConstructionPortsV1 {
  readonly dbEvidence: FourCharacterPublishedArtifactEvidencePortV1;
  /** Server-owned immutable artifact store. Never HTTP/user-controlled URL. */
  readonly artifacts: Readonly<{
    loadByApprovedRef(ref: string): Promise<Uint8Array | null>;
  }>;
  /** Independently approved, versioned per-Character Bible/Runtime compiler.
   * This is NOT a fallback to Se-yeon's prompt or an LLM-generated canon.
   */
  readonly compiler: Readonly<{
    compile(input: Readonly<{
      characterId: FourIndependentChatTargetV1;
      evidence: FourCharacterPublishedArtifactEvidenceV1;
      artifactBytes: Uint8Array;
    }>): Promise<FourCharacterVerifiedSourceCompilerOutputV1 | null>;
  }>;
}

type PublicationPortV1 = FourCharacterProductionExecutionPortsV1['publication'];

function required(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length === 0 ||
      value.trim() !== value || value.length > max) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return value as Record<string, unknown>;
}

function matchArtifactBytes(
  evidence: FourCharacterPublishedArtifactEvidenceV1,
  bytes: Uint8Array | null,
  characterId: FourIndependentChatTargetV1,
  contentVersion: string,
): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 512_000) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const digest = 'sha256:v1:' + createHash('sha256').update(bytes).digest('hex');
  if (digest !== evidence.contentHash) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  let artifact: Record<string, unknown>;
  try {
    artifact = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const bundleMetadata = record(artifact.bundleMetadata);
  record(artifact.sourceAuthority);
  if (artifact.schemaVersion !== evidence.artifactSchemaVersion ||
      artifact.characterId !== characterId ||
      artifact.contentVersion !== contentVersion ||
      bundleMetadata.minClientCapability !== evidence.minClientCapability ||
      bundleMetadata.assetManifestHash !== evidence.assetManifestHash ||
      bundleMetadata.cueSchemaVersion !== evidence.cueSchemaVersion) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
}

export function createFourCharacterPublishedModelSourcePortV1(
  ports: FourCharacterPublishedSourceConstructionPortsV1,
): PublicationPortV1 {
  return Object.freeze({
    async readPublishedSource(input) {
      try {
        const evidence = await ports.dbEvidence.readPublishedArtifact({
          subjectId: input.subjectId,
          threadId: input.threadId,
          characterId: input.characterId,
          releaseId: input.releaseId,
          bundleId: input.bundleId,
        });
        if (evidence.characterId !== input.characterId ||
            evidence.releaseId !== input.releaseId ||
            evidence.bundleId !== input.bundleId ||
            evidence.contentVersion !== input.contentVersion) {
          throw new FourCharacterPublishedArtifactUnavailableV1();
        }

        const artifactBytes = await ports.artifacts.loadByApprovedRef(evidence.artifactRef);
        matchArtifactBytes(
          evidence, artifactBytes,
          input.characterId, input.contentVersion,
        );
        const compiled = await ports.compiler.compile({
          characterId: input.characterId,
          evidence,
          artifactBytes,
        });
        if (compiled === null) {
          throw new FourCharacterPublishedArtifactUnavailableV1();
        }
        return Object.freeze({
          status: 'published' as const,
          characterId: input.characterId,
          releaseId: input.releaseId,
          bundleId: input.bundleId,
          contentVersion: evidence.contentVersion,
          assetManifestHash: evidence.assetManifestHash,
          cueSchemaVersion: evidence.cueSchemaVersion,
          bibleSourceRef: required(compiled.bibleSourceRef, 512),
          runtimeSourceRef: required(compiled.runtimeSourceRef, 512),
          sourceDigest: evidence.contentHash,
          canonicalContext: required(compiled.canonicalContext, FOUR_CHARACTER_CHAT_MAX_CANONICAL_CONTEXT_UTF16_CODE_UNITS_V1),
        }) satisfies PublishedFourCharacterModelSourceV1;
      } catch {
        // Any DB/asset/compiler or integrity failure must block Model calls
        // without exposing potentially personal artifact or error data.
        throw new FourCharacterPublishedArtifactUnavailableV1();
      }
    },
  });
}
