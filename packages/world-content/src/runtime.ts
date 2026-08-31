import type { CharacterContentBundle } from '../../character-content/src/index.js';
import {
  buildCharacterContentManifest,
} from '../../character-content/src/index.js';
import type { CoherentContentRelease, WorldContentBundle } from './schema.js';
import { buildWorldContentManifest } from './release.js';

export type ContentReleaseLifecycle = 'active' | 'retired';

export interface ContentReleaseRuntimeEntry {
  readonly release: CoherentContentRelease;
  readonly characters: CharacterContentBundle;
  readonly world: WorldContentBundle;
  readonly lifecycle: ContentReleaseLifecycle;
}

export interface ResolveNewThreadInput {
  readonly clientCapability: string;
  readonly orderedReleaseIds: readonly string[];
}

export class ContentReleaseRuntimeError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CATALOG'
      | 'INVALID_RELEASE_ORDER'
      | 'CONTENT_INCOMPATIBLE'
      | 'COMPATIBILITY_AUTHORITY_UNAVAILABLE'
      | 'UNKNOWN_RELEASE',
    message: string,
  ) {
    super(message);
    this.name = 'ContentReleaseRuntimeError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `${field} must not be empty.`,
    );
  }
  return normalized;
}

function validateEntry(entry: ContentReleaseRuntimeEntry): void {
  const releaseId = assertNonEmpty(entry.release.releaseId, 'releaseId');
  const characterManifest = buildCharacterContentManifest(entry.characters);
  const worldManifest = buildWorldContentManifest(entry.world, entry.characters);

  if (
    entry.release.bundleId !== characterManifest.bundleId ||
    entry.release.bundleId !== worldManifest.bundleId
  ) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `Release ${releaseId} bundleId does not match its immutable artifacts.`,
    );
  }
  if (
    entry.release.contentVersion !== characterManifest.contentVersion ||
    entry.release.contentVersion !== worldManifest.contentVersion
  ) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `Release ${releaseId} contentVersion does not match its immutable artifacts.`,
    );
  }
  if (entry.release.characterContentHash !== characterManifest.contentHash) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `Release ${releaseId} character content hash mismatch.`,
    );
  }
  if (entry.release.worldContentHash !== worldManifest.contentHash) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `Release ${releaseId} world content hash mismatch.`,
    );
  }
  if (entry.release.minClientCapability !== characterManifest.minClientCapability) {
    throw new ContentReleaseRuntimeError(
      'INVALID_CATALOG',
      `Release ${releaseId} minClientCapability does not match its character manifest.`,
    );
  }
}

function compatibilityAuthorityUnavailable(): ContentReleaseRuntimeError {
  return new ContentReleaseRuntimeError(
    'COMPATIBILITY_AUTHORITY_UNAVAILABLE',
    'Client/content compatibility verdict is unavailable until SRC-15 source authority is resolved.',
  );
}

export class ContentReleaseRuntime {
  readonly #entriesByReleaseId = new Map<string, ContentReleaseRuntimeEntry>();

  constructor(entries: readonly ContentReleaseRuntimeEntry[]) {
    if (entries.length === 0) {
      throw new ContentReleaseRuntimeError(
        'INVALID_CATALOG',
        'Content release catalog must not be empty.',
      );
    }

    for (const entry of entries) {
      validateEntry(entry);
      const releaseId = entry.release.releaseId.trim();
      if (this.#entriesByReleaseId.has(releaseId)) {
        throw new ContentReleaseRuntimeError(
          'INVALID_CATALOG',
          `Duplicate content release id: ${releaseId}`,
        );
      }
      this.#entriesByReleaseId.set(releaseId, Object.freeze({ ...entry }));
    }
  }

  resolveForNewThread(_input: ResolveNewThreadInput): never {
    throw compatibilityAuthorityUnavailable();
  }

  resolvePinned(releaseIdInput: string): ContentReleaseRuntimeEntry {
    const releaseId = releaseIdInput.trim();
    const entry = this.#entriesByReleaseId.get(releaseId);
    if (entry === undefined) {
      throw new ContentReleaseRuntimeError(
        'UNKNOWN_RELEASE',
        `Unknown pinned content release: ${releaseId}`,
      );
    }
    return entry;
  }

  assertPinnedClientCompatible(
    _releaseId: string,
    _clientCapabilityInput: string,
  ): never {
    throw compatibilityAuthorityUnavailable();
  }
}
