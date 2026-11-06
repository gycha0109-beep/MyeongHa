// Watchtower-Track: character-memory
// Deterministic compiler for an independently published one-Character bundle.
// It never assembles or approves missing canon/material. The active DB release,
// immutable artifact hash and explicit approval provenance must already exist.
import {
  createHash,
} from 'node:crypto';
import {
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  CHARACTER_RUNTIME_AUTHORING_V1,
  buildProductionCharacterPublicationLaneManifestV1,
  validateProductionCharacterPublicationLaneBundleV1,
  type CharacterContentBundle,
  type CharacterContentDefinition,
} from '../../../packages/character-content/src/index.js';
import type {
  FourCharacterPublishedArtifactEvidenceV1,
} from './postgres-four-character-publication-evidence-v1.js';
import {
  FourCharacterPublishedArtifactUnavailableV1,
} from './postgres-four-character-publication-evidence-v1.js';
import type {
  FourCharacterPublishedSourceCompilerOutputV1,
  FourCharacterPublishedSourceConstructionPortsV1,
} from './four-character-published-model-source-v1.js';
import type {
  FourIndependentChatTargetV1,
} from './four-character-production-chat-executor-v1.js';

const CANONICAL_CONTEXT_SCHEMA_V1 = 'four-character-canonical-context-v1' as const;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return value as Record<string, unknown>;
}

function required(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 ||
      value.trim() !== value || value.length > maxLength) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  return serialized;
}

function verifyImmutableAndRuntimeSource(
  characterId: FourIndependentChatTargetV1,
  character: CharacterContentDefinition,
): void {
  const immutable = CHARACTER_IMMUTABLE_AUTHORING_V1.find(
    entry => entry.characterId === characterId,
  );
  const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
    entry => entry.characterId === characterId,
  );
  if (immutable === undefined || runtime === undefined) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  const immutableProjection = {
    displayName: immutable.displayName,
    gender: immutable.gender,
    deityProxyLabel: immutable.deityProxyLabel,
    shortDescriptor: immutable.shortDescriptor,
    personalityTraits: immutable.personalityTraits,
    flaws: immutable.flaws,
    values: immutable.values,
    visual: immutable.visual,
    canon: {
      worldRole: immutable.worldRole,
      origin: immutable.origin,
      apparentAgeBand: immutable.apparentAgeBand,
      deityBond: {
        deityId: immutable.deityId,
        representationRole: immutable.deityBond.representationRole,
        oath: immutable.deityBond.oath,
        acceptedDoctrine: immutable.deityBond.acceptedDoctrine,
        resistedDoctrine: immutable.deityBond.resistedDoctrine,
      },
    },
  };
  const actualImmutableProjection = {
    displayName: character.displayName,
    gender: character.gender,
    deityProxyLabel: character.deityProxyLabel,
    shortDescriptor: character.shortDescriptor,
    personalityTraits: character.personalityTraits,
    flaws: character.flaws,
    values: character.values,
    visual: character.visual,
    canon: character.canon === undefined ? undefined : {
      worldRole: character.canon.worldRole,
      origin: character.canon.origin,
      apparentAgeBand: character.canon.apparentAgeBand,
      deityBond: character.canon.deityBond,
    },
  };
  const runtimeProjection = {
    speech: runtime.speech,
    capabilities: runtime.capabilities,
    persona: runtime.persona,
    behavior: runtime.behavior,
    sajuProfile: runtime.sajuProfile,
    relationshipBehavior: runtime.relationshipBehavior,
  };
  const actualRuntimeProjection = {
    speech: character.speech,
    capabilities: character.capabilities,
    persona: character.persona,
    behavior: character.behavior,
    sajuProfile: character.sajuProfile,
    relationshipBehavior: character.relationshipBehavior,
  };

  if (stableJson(actualImmutableProjection) !== stableJson(immutableProjection) ||
      stableJson(actualRuntimeProjection) !== stableJson(runtimeProjection)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
}

function compileArtifact(
  input: Readonly<{
    characterId: FourIndependentChatTargetV1;
    evidence: FourCharacterPublishedArtifactEvidenceV1;
    artifactBytes: Uint8Array;
  }>,
): FourCharacterPublishedSourceCompilerOutputV1 {
  const { characterId, evidence, artifactBytes } = input;
  if (!(artifactBytes instanceof Uint8Array) ||
      artifactBytes.length === 0 || artifactBytes.length > 512_000) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const digest = 'sha256:v1:' +
    createHash('sha256').update(artifactBytes).digest('hex');
  if (digest !== evidence.contentHash ||
      evidence.characterId !== characterId) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  let artifact: Record<string, unknown>;
  try {
    artifact = record(JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(artifactBytes),
    ));
  } catch {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  if (artifact.schemaVersion !== evidence.artifactSchemaVersion ||
      artifact.characterId !== characterId ||
      artifact.contentVersion !== evidence.contentVersion) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  const metadata = record(artifact.bundleMetadata);
  if (metadata.minClientCapability !== evidence.minClientCapability ||
      metadata.assetManifestHash !== evidence.assetManifestHash ||
      metadata.cueSchemaVersion !== evidence.cueSchemaVersion) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  const authority = record(artifact.sourceAuthority);
  if (authority.approvalStatus !== 'approved') {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  const bibleSourceRef = required(authority.bibleSourceRef, 512);
  const runtimeSourceRef = required(authority.runtimeSourceRef, 512);
  const approvalRef = required(authority.approvalRef, 512);
  const sourceCommit = required(authority.sourceCommit, 40);
  if (bibleSourceRef === runtimeSourceRef ||
      !/^[0-9a-f]{40}$/iu.test(sourceCommit)) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  const bundle = record(artifact.contentBundle) as unknown as CharacterContentBundle;
  if (bundle.bundleId !== evidence.bundleId ||
      bundle.contentVersion !== evidence.contentVersion ||
      bundle.assetManifestHash !== evidence.assetManifestHash ||
      bundle.cueSchemaVersion !== evidence.cueSchemaVersion ||
      bundle.minClientCapability !== evidence.minClientCapability) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  // The Production lane validator enforces one Character, complete authored
  // canon/visual, concrete renderer assets/cues and versioned manifest hash.
  validateProductionCharacterPublicationLaneBundleV1(bundle);
  const manifest = buildProductionCharacterPublicationLaneManifestV1(bundle);
  if (manifest.bundleId !== evidence.bundleId ||
      manifest.contentVersion !== evidence.contentVersion ||
      manifest.characterIds.length !== 1 ||
      manifest.characterIds[0] !== characterId ||
      manifest.contentHash !== artifact.contentBundleHash) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  const character = bundle.characters[0];
  if (character === undefined || character.characterId !== characterId ||
      character.contentVersion !== evidence.contentVersion) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }
  verifyImmutableAndRuntimeSource(characterId, character);

  // Assets are renderer authority, not model prompt content. Only the
  // source-backed Character canon and approved Runtime values enter context.
  const canonicalContext = stableJson({
    schemaVersion: CANONICAL_CONTEXT_SCHEMA_V1,
    characterId,
    contentVersion: evidence.contentVersion,
    sourceAuthority: {
      bibleSourceRef,
      runtimeSourceRef,
      approvalRef,
      sourceCommit,
      contentBundleHash: manifest.contentHash,
    },
    character: {
      displayName: character.displayName,
      gender: character.gender,
      deityProxyLabel: character.deityProxyLabel,
      shortDescriptor: character.shortDescriptor,
      personalityTraits: character.personalityTraits,
      flaws: character.flaws,
      values: character.values,
      canon: character.canon,
      speech: character.speech,
      capabilities: character.capabilities,
      persona: character.persona,
      behavior: character.behavior,
      sajuProfile: character.sajuProfile,
      relationshipBehavior: character.relationshipBehavior,
    },
  });
  if (canonicalContext.length === 0 || canonicalContext.length > 32768) {
    throw new FourCharacterPublishedArtifactUnavailableV1();
  }

  return Object.freeze({
    bibleSourceRef,
    runtimeSourceRef,
    canonicalContext,
  });
}

/** Plug this compiler into the existing hash-bound publication source port. */
export function createFourCharacterPublishedModelSourceCompilerV1():
  FourCharacterPublishedSourceConstructionPortsV1['compiler'] {
  return Object.freeze({
    async compile(input): Promise<FourCharacterPublishedSourceCompilerOutputV1> {
      try {
        return compileArtifact(input);
      } catch {
        // Keep all artifact/approval/compiler failures indistinguishable to the
        // caller; no partial Character content or raw parser errors may escape.
        throw new FourCharacterPublishedArtifactUnavailableV1();
      }
    },
  });
}
