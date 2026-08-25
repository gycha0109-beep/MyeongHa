import { describe, expect, it } from 'vitest';
import { buildCharacterContentManifest } from '../packages/character-content/src/index.js';
import {
  buildCoherentContentRelease,
  buildWorldContentManifest,
  ContentReleaseRuntime,
  ContentReleaseRuntimeError,
  type ContentCompatibilityPolicy,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';

const compatibilityPolicy: ContentCompatibilityPolicy = {
  policyVersion: 'test-client-capability-v1',
  supports(clientCapability, minClientCapability) {
    return (
      clientCapability === minClientCapability ||
      clientCapability === 'future-compatible-client'
    );
  },
};

const characterManifest = buildCharacterContentManifest(
  DEV_CHARACTER_CONTENT_BUNDLE,
);
const worldManifest = buildWorldContentManifest(
  DEV_WORLD_CONTENT_BUNDLE,
  DEV_CHARACTER_CONTENT_BUNDLE,
);

function entry(
  releaseId: string,
  lifecycle: 'active' | 'retired',
): ContentReleaseRuntimeEntry {
  return {
    release: buildCoherentContentRelease(
      releaseId,
      characterManifest,
      worldManifest,
    ),
    characters: DEV_CHARACTER_CONTENT_BUNDLE,
    world: DEV_WORLD_CONTENT_BUNDLE,
    lifecycle,
  };
}

describe('content release runtime', () => {
  it('uses operational ordering instead of inventing release precedence', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('release-a', 'active'), entry('release-b', 'active')],
      compatibilityPolicy,
    );

    expect(
      runtime.resolveForNewThread({
        clientCapability: '0.0.1-dev',
        orderedReleaseIds: ['release-b', 'release-a'],
      }).release.releaseId,
    ).toBe('release-b');
  });

  it('never selects a retired release for a new thread', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('retired-first', 'retired'), entry('active-second', 'active')],
      compatibilityPolicy,
    );

    expect(
      runtime.resolveForNewThread({
        clientCapability: '0.0.1-dev',
        orderedReleaseIds: ['retired-first', 'active-second'],
      }).release.releaseId,
    ).toBe('active-second');
  });

  it('continues resolving an explicitly pinned retired release', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('retired-pinned', 'retired'), entry('current', 'active')],
      compatibilityPolicy,
    );

    expect(runtime.resolvePinned('retired-pinned')).toMatchObject({
      lifecycle: 'retired',
      release: { releaseId: 'retired-pinned' },
    });
  });

  it('does not silently move an incompatible pinned thread to another release', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('pinned', 'retired'), entry('newer', 'active')],
      compatibilityPolicy,
    );

    expect(() =>
      runtime.assertPinnedClientCompatible('pinned', 'older-client'),
    ).toThrowError(ContentReleaseRuntimeError);
    expect(() =>
      runtime.assertPinnedClientCompatible('pinned', 'older-client'),
    ).toThrow(/cannot render pinned content release/u);
  });

  it('fails closed when there is no active compatible release', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('only-active', 'active')],
      compatibilityPolicy,
    );

    expect(() =>
      runtime.resolveForNewThread({
        clientCapability: 'older-client',
        orderedReleaseIds: ['only-active'],
      }),
    ).toThrow(/No active client-compatible content release/u);
  });

  it('rejects unknown and duplicate operational release ordering', () => {
    const runtime = new ContentReleaseRuntime(
      [entry('known', 'active')],
      compatibilityPolicy,
    );

    expect(() =>
      runtime.resolveForNewThread({
        clientCapability: '0.0.1-dev',
        orderedReleaseIds: ['unknown'],
      }),
    ).toThrow(/unknown release/u);
    expect(() =>
      runtime.resolveForNewThread({
        clientCapability: '0.0.1-dev',
        orderedReleaseIds: ['known', 'known'],
      }),
    ).toThrow(/duplicate release id/u);
  });

  it('rejects duplicate catalog release ids', () => {
    expect(
      () =>
        new ContentReleaseRuntime(
          [entry('duplicate', 'active'), entry('duplicate', 'retired')],
          compatibilityPolicy,
        ),
    ).toThrow(/Duplicate content release id/u);
  });

  it('rejects release metadata that does not match immutable bundle hashes', () => {
    const valid = entry('tampered', 'active');
    const tampered: ContentReleaseRuntimeEntry = {
      ...valid,
      release: {
        ...valid.release,
        characterContentHash: 'sha256:tampered',
      },
    };

    expect(
      () => new ContentReleaseRuntime([tampered], compatibilityPolicy),
    ).toThrow(/character content hash mismatch/u);
  });

  it('requires the compatibility policy itself to be versioned', () => {
    expect(
      () =>
        new ContentReleaseRuntime([entry('valid', 'active')], {
          policyVersion: '   ',
          supports: () => true,
        }),
    ).toThrow(/compatibility policy version/u);
  });
});
