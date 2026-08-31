import { describe, expect, it } from 'vitest';
import { buildCharacterContentManifest } from '../packages/character-content/src/index.js';
import {
  buildCoherentContentRelease,
  buildWorldContentManifest,
  ContentReleaseRuntime,
  ContentReleaseRuntimeError,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';

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

function expectRuntimeCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('Expected ContentReleaseRuntimeError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ContentReleaseRuntimeError);
    expect((error as ContentReleaseRuntimeError).code).toBe(code);
  }
}

describe('content release runtime', () => {
  it('fails closed instead of inventing a new-thread client compatibility verdict', () => {
    const runtime = new ContentReleaseRuntime([
      entry('release-a', 'active'),
      entry('release-b', 'active'),
    ]);

    expectRuntimeCode(
      () =>
        runtime.resolveForNewThread({
          clientCapability: '0.0.1-dev',
          orderedReleaseIds: ['release-b', 'release-a'],
        }),
      'COMPATIBILITY_AUTHORITY_UNAVAILABLE',
    );
  });

  it('does not treat equality with minClientCapability as compatibility authority', () => {
    const runtime = new ContentReleaseRuntime([entry('active', 'active')]);

    expectRuntimeCode(
      () =>
        runtime.resolveForNewThread({
          clientCapability: characterManifest.minClientCapability,
          orderedReleaseIds: ['active'],
        }),
      'COMPATIBILITY_AUTHORITY_UNAVAILABLE',
    );
  });

  it('continues resolving an explicitly pinned retired release for historical lookup', () => {
    const runtime = new ContentReleaseRuntime([
      entry('retired-pinned', 'retired'),
      entry('current', 'active'),
    ]);

    expect(runtime.resolvePinned('retired-pinned')).toMatchObject({
      lifecycle: 'retired',
      release: { releaseId: 'retired-pinned' },
    });
  });

  it('fails closed instead of inventing a pinned-thread client compatibility verdict', () => {
    const runtime = new ContentReleaseRuntime([
      entry('pinned', 'retired'),
      entry('newer', 'active'),
    ]);

    expectRuntimeCode(
      () => runtime.assertPinnedClientCompatible('pinned', 'future-client'),
      'COMPATIBILITY_AUTHORITY_UNAVAILABLE',
    );
  });

  it('does not use operational release ordering as a substitute for compatibility authority', () => {
    const runtime = new ContentReleaseRuntime([entry('known', 'active')]);

    expectRuntimeCode(
      () =>
        runtime.resolveForNewThread({
          clientCapability: '0.0.1-dev',
          orderedReleaseIds: ['known'],
        }),
      'COMPATIBILITY_AUTHORITY_UNAVAILABLE',
    );
  });

  it('rejects duplicate catalog release ids', () => {
    expect(
      () =>
        new ContentReleaseRuntime([
          entry('duplicate', 'active'),
          entry('duplicate', 'retired'),
        ]),
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

    expect(() => new ContentReleaseRuntime([tampered])).toThrow(
      /character content hash mismatch/u,
    );
  });

  it('rejects unknown pinned release ids without making a compatibility verdict', () => {
    const runtime = new ContentReleaseRuntime([entry('known', 'active')]);

    expectRuntimeCode(
      () => runtime.resolvePinned('unknown'),
      'UNKNOWN_RELEASE',
    );
  });
});
