import { createHash } from 'node:crypto';

import {
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  type CharacterImmutableAuthoringV1CharacterId,
} from './immutable-authoring-v1.js';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  type CharacterRuntimeAuthoringV1Definition,
} from './runtime-authoring-v1.js';

export const CHARACTER_RUNTIME_AUTHORITY_LANE_SCHEMA_VERSION_V1 =
  'character-runtime-authority-lane-v1' as const;

export interface CharacterRuntimeAuthoritySourceRefV1 {
  readonly path: string;
  readonly blobSha: string;
}

export interface CharacterRuntimeAuthorityProvenanceV1 {
  readonly decisionDocument: string;
  readonly reviewedCommit: string;
  readonly bible: CharacterRuntimeAuthoritySourceRefV1;
  readonly runtime: CharacterRuntimeAuthoritySourceRefV1;
  readonly typedProjection: CharacterRuntimeAuthoritySourceRefV1;
}

export interface CharacterRuntimeAuthorityLaneV1 {
  readonly schemaVersion:
    typeof CHARACTER_RUNTIME_AUTHORITY_LANE_SCHEMA_VERSION_V1;
  readonly characterId: CharacterImmutableAuthoringV1CharacterId;
  readonly displayName: string;
  readonly authorityVersion: string;
  readonly provenance: CharacterRuntimeAuthorityProvenanceV1;
  readonly runtime: CharacterRuntimeAuthoringV1Definition;
  readonly speech: CharacterRuntimeAuthoringV1Definition['speech'];
  readonly communication:
    CharacterRuntimeAuthoringV1Definition['persona']['communication'];
  readonly questioning:
    CharacterRuntimeAuthoringV1Definition['persona']['questioning'];
}

export class CharacterRuntimeAuthorityLaneErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterRuntimeAuthorityLaneErrorV1';
  }
}

const SEYEON_RUNTIME_AUTHORITY_PROVENANCE_V1 =
  Object.freeze({
    decisionDocument:
      'docs/source-authority-decisions/SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md',
    reviewedCommit:
      'a0afd9bda57ae0a3f48396d9b55a651403bbcc41',
    bible: Object.freeze({
      path: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      blobSha: 'de6cef1a86d690f7d614967707fe953471792123',
    }),
    runtime: Object.freeze({
      path: 'docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',
      blobSha: 'fcaa41f08a04ac66942609a5023fa6f69e9896a0',
    }),
    typedProjection: Object.freeze({
      path: 'packages/character-content/src/runtime-authoring-v1.ts',
      blobSha: 'e65806207dd78a0cc817ffcf7f51be8bf4e47ab3',
    }),
  }) satisfies CharacterRuntimeAuthorityProvenanceV1;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/u.test(value);
}

function requireSourceRef(
  value: CharacterRuntimeAuthoritySourceRefV1,
  label: string,
): void {
  if (value.path.trim().length === 0 || !isGitSha(value.blobSha)) {
    throw new CharacterRuntimeAuthorityLaneErrorV1(
      `${label} must contain a repository path and exact git blob SHA.`,
    );
  }
}

function buildAuthorityVersion(
  characterId: CharacterImmutableAuthoringV1CharacterId,
  provenance: CharacterRuntimeAuthorityProvenanceV1,
  runtime: CharacterRuntimeAuthoringV1Definition,
): string {
  const payload = stableJson({
    schemaVersion: CHARACTER_RUNTIME_AUTHORITY_LANE_SCHEMA_VERSION_V1,
    characterId,
    provenance,
    runtime,
  });
  return `sha256:v1:${createHash('sha256').update(payload).digest('hex')}`;
}

function buildCharacterRuntimeAuthorityLaneV1(
  characterId: CharacterImmutableAuthoringV1CharacterId,
  provenance: CharacterRuntimeAuthorityProvenanceV1,
): CharacterRuntimeAuthorityLaneV1 {
  if (
    provenance.decisionDocument.trim().length === 0 ||
    !isGitSha(provenance.reviewedCommit)
  ) {
    throw new CharacterRuntimeAuthorityLaneErrorV1(
      'Character runtime authority provenance is incomplete.',
    );
  }
  requireSourceRef(provenance.bible, 'Bible source');
  requireSourceRef(provenance.runtime, 'Runtime source');
  requireSourceRef(provenance.typedProjection, 'Typed projection source');

  const immutable = CHARACTER_IMMUTABLE_AUTHORING_V1.find(
    (entry) => entry.characterId === characterId,
  );
  const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (entry) => entry.characterId === characterId,
  );

  if (immutable === undefined || runtime === undefined) {
    throw new CharacterRuntimeAuthorityLaneErrorV1(
      `Character runtime authority source is unavailable: ${characterId}`,
    );
  }
  if (runtime.displayName !== immutable.displayName) {
    throw new CharacterRuntimeAuthorityLaneErrorV1(
      `Character runtime display identity does not match immutable authoring: ${characterId}`,
    );
  }

  return Object.freeze({
    schemaVersion: CHARACTER_RUNTIME_AUTHORITY_LANE_SCHEMA_VERSION_V1,
    characterId,
    displayName: runtime.displayName,
    authorityVersion: buildAuthorityVersion(
      characterId,
      provenance,
      runtime,
    ),
    provenance,
    runtime,
    speech: runtime.speech,
    communication: runtime.persona.communication,
    questioning: runtime.persona.questioning,
  });
}

const CHARACTER_RUNTIME_AUTHORITY_LANES_V1 =
  Object.freeze([
    buildCharacterRuntimeAuthorityLaneV1(
      'seyeon',
      SEYEON_RUNTIME_AUTHORITY_PROVENANCE_V1,
    ),
  ] as const);

export const CHARACTER_RUNTIME_AUTHORITY_LANE_CHARACTER_IDS_V1 =
  Object.freeze(
    CHARACTER_RUNTIME_AUTHORITY_LANES_V1.map(
      (lane) => lane.characterId,
    ),
  );

export function resolveCharacterRuntimeAuthorityLaneV1(
  characterId: string,
): CharacterRuntimeAuthorityLaneV1 | null {
  return (
    CHARACTER_RUNTIME_AUTHORITY_LANES_V1.find(
      (lane) => lane.characterId === characterId,
    ) ?? null
  );
}
