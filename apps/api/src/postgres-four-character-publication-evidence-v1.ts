// Watchtower-Track: character-memory
// Exact Member-owned, non-default Character publication evidence from DB.
// This is only the authoritative artifact locator, NOT an AI-readable canon
// source or permission to reveal a reply. Operation production-02 must exist.
import type {
  FourIndependentChatTargetV1,
} from './four-character-production-chat-executor-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  SeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';

export const FOUR_CHARACTER_PUBLISHED_ARTIFACT_DB_BINDING_V1 =
  'public.qry_four_character_published_artifact_v1' as const;

const READ_SQL = `
select
  character_id as "characterId",
  release_id::text as "releaseId",
  bundle_id::text as "bundleId",
  content_version as "contentVersion",
  content_hash as "contentHash",
  artifact_ref as "artifactRef",
  artifact_schema_version as "artifactSchemaVersion",
  min_client_capability as "minClientCapability",
  asset_manifest_hash as "assetManifestHash",
  cue_schema_version as "cueSchemaVersion"
from public.qry_four_character_published_artifact_v1(
  $1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid
)
`.trim();

export interface FourCharacterPublishedArtifactEvidenceV1 {
  readonly characterId: FourIndependentChatTargetV1;
  readonly releaseId: string;
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly artifactRef: string;
  readonly artifactSchemaVersion: string;
  readonly minClientCapability: string;
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
}

export interface ReadFourCharacterPublishedArtifactEvidenceInputV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly characterId: FourIndependentChatTargetV1;
  readonly releaseId: string;
  readonly bundleId: string;
}

export interface FourCharacterPublishedArtifactEvidencePortV1 {
  readPublishedArtifact(
    input: ReadFourCharacterPublishedArtifactEvidenceInputV1,
  ): Promise<FourCharacterPublishedArtifactEvidenceV1>;
}

export class FourCharacterPublishedArtifactUnavailableV1 extends Error {
  readonly code = 'FOUR_CHARACTER_PUBLISHED_ARTIFACT_UNAVAILABLE' as const;
  constructor() {
    super('Independent Character published artifact is unavailable.');
    this.name = 'FourCharacterPublishedArtifactUnavailableV1';
  }
}

function required(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 ||
      value !== value.trim() || value.length > limit) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return value;
}

function uuid(value: unknown): string {
  const string = required(value, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(string)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return string;
}

function assertInput(input: ReadFourCharacterPublishedArtifactEvidenceInputV1): void {
  uuid(input.subjectId);
  uuid(input.threadId);
  uuid(input.releaseId);
  uuid(input.bundleId);
  if (
    input.characterId !== 'baekheon' &&
    input.characterId !== 'yeoul' &&
    input.characterId !== 'rahyeon' &&
    input.characterId !== 'taegyeom'
  ) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
}

function mapEvidence(
  rows: readonly Readonly<Record<string, unknown>>[],
  input: ReadFourCharacterPublishedArtifactEvidenceInputV1,
): FourCharacterPublishedArtifactEvidenceV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const row = rows[0];
  const characterId = required(row.characterId, 32);
  const releaseId = uuid(row.releaseId);
  const bundleId = uuid(row.bundleId);
  if (characterId !== input.characterId ||
      releaseId !== input.releaseId.toLowerCase() ||
      bundleId !== input.bundleId.toLowerCase()) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const contentHash = required(row.contentHash, 75);
  if (!/^sha256:v1:[a-f0-9]{64}$/u.test(contentHash)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const artifactRef = required(row.artifactRef, 512);
  // An artifact locator is a repository provenance ref, not an arbitrary URL
  // or filesystem path supplied by the browser. The artifact loader has its
  // own trusted ref-to-bytes mapping and must rehash the exact artifact bytes.
  if (!/^docs\/character\/[a-zA-Z0-9_.\/-]+\.json$/u.test(artifactRef) ||
      artifactRef.includes('..') || artifactRef.includes('//')) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return Object.freeze({
    characterId: input.characterId,
    releaseId,
    bundleId,
    contentVersion: required(row.contentVersion, 256),
    contentHash,
    artifactRef,
    artifactSchemaVersion: required(row.artifactSchemaVersion, 256),
    minClientCapability: required(row.minClientCapability, 256),
    assetManifestHash: required(row.assetManifestHash, 128),
    cueSchemaVersion: required(row.cueSchemaVersion, 256),
  });
}

/** Executes only inside an already-verified Member Subject transaction. */
export function createPostgresFourCharacterPublishedArtifactEvidencePortV1(
  client: PostgresTransactionQueryV1,
): FourCharacterPublishedArtifactEvidencePortV1 {
  return Object.freeze({
    async readPublishedArtifact(input: ReadFourCharacterPublishedArtifactEvidenceInputV1) {
      assertInput(input);
      try {
        const response = await client.query<Readonly<Record<string, unknown>>>(
          READ_SQL,
          [input.subjectId, input.threadId, input.characterId,
            input.releaseId, input.bundleId],
        );
        return mapEvidence(response.rows, input);
      } catch {
        // SQL, ACL and owner context failures must not expose any source
        // details or allow fallback to another Character's publication.
        throw new FourCharacterPublishedArtifactUnavailableV1();
      }
    },
  });
}

/** Existing canonical Subject runner supplies transaction-local API role and
 * verifies the same Member Subject on every source lookup. No direct DB login.
 */
export function createScopedFourCharacterPublishedArtifactEvidencePortV1(input: {
  readonly subjectId: string;
  readonly runner: SeyeonProductionSubjectTransactionRunnerV1;
}): FourCharacterPublishedArtifactEvidencePortV1 {
  const subjectId = uuid(input.subjectId);
  return Object.freeze({
    async readPublishedArtifact(request: ReadFourCharacterPublishedArtifactEvidenceInputV1) {
      assertInput(request);
      if (request.subjectId.toLowerCase() !== subjectId) {
        throw new FourCharacterPublishedArtifactUnavailableV1();
      }
      return input.runner.run(subjectId, client =>
        createPostgresFourCharacterPublishedArtifactEvidencePortV1(client)
          .readPublishedArtifact(request));
    },
  });
}
