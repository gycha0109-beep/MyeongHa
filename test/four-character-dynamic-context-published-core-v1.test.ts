import { describe, expect, it, vi } from 'vitest';

import {
  FOUR_INDEPENDENT_CHAT_TARGETS_V1,
  type FourIndependentChatTargetV1,
  type PublishedFourCharacterModelSourceV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';
import {
  prepareFourCharacterPublishedContextCoreV1,
} from '../apps/api/src/four-character-dynamic-context-published-core-v1.js';
import {
  composeCharacterDynamicContextV1,
  type CharacterContextSegmentV1,
} from '../packages/domain/src/character-dynamic-context-composer-v1.js';
import {
  buildCharacterWorkingMemoryProjectionV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';
import {
  retrieveCharacterWorkingMemoryV1,
} from '../packages/domain/src/character-memory-retrieval-v1.js';

const scope = Object.freeze({
  subjectId: 'subject-approved',
  characterId: 'baekheon',
  threadId: 'thread-approved',
});
const pin = Object.freeze({
  releaseId: 'release-approved',
  bundleId: 'bundle-approved',
  contentVersion: 'bundle-version-1',
});
const digest = 'sha256:v1:' + 'a'.repeat(64);

function published(
  characterId: FourIndependentChatTargetV1 = 'baekheon',
): PublishedFourCharacterModelSourceV1 {
  return {
    status: 'published',
    characterId,
    releaseId: pin.releaseId,
    bundleId: pin.bundleId,
    contentVersion: pin.contentVersion,
    sourceDigest: digest,
    bibleSourceRef: 'docs/character/approved-bible.md',
    runtimeSourceRef: 'docs/character/approved-runtime.md',
    assetManifestHash: 'sha256:v1:' + 'b'.repeat(64),
    cueSchemaVersion: 'fixture-cues-v1',
    canonicalContext: JSON.stringify({
      schemaVersion: 'four-character-canonical-context-v1',
      characterId,
      sourceAuthority: {
        bibleSourceRef: 'docs/character/approved-bible.md',
        runtimeSourceRef: 'docs/character/approved-runtime.md',
      },
    }),
  };
}

function harness(characterId: FourIndependentChatTargetV1 = 'baekheon') {
  const publication = {
    readPublishedSource: vi.fn(async () => published(characterId) as PublishedFourCharacterModelSourceV1 | null),
  };
  const otherSourceAdmission = {
    admit: vi.fn(({ segment }: { segment: CharacterContextSegmentV1 }) =>
      (segment.layer === 'system_safety_product' && segment.sourceRef === 'policy:approved' &&
        segment.text === 'Approved policy.') ||
      (segment.layer === 'response_task' && segment.sourceRef === 'task:approved' &&
        segment.text === 'Answer this turn.')),
  };
  return { publication, otherSourceAdmission };
}

describe('published four-Character context -> offline source admission', () => {
  it.each(FOUR_INDEPENDENT_CHAT_TARGETS_V1)(
    'pins %s to the same Subject/thread and exact immutable published text',
    async characterId => {
      const ports = harness(characterId);
      const currentScope = { ...scope, characterId };
      const prepared = await prepareFourCharacterPublishedContextCoreV1({
        ...ports,
        scope: currentScope,
        pin,
      });
      expect(ports.publication.readPublishedSource).toHaveBeenCalledWith({
        subjectId: scope.subjectId,
        threadId: scope.threadId,
        characterId,
        ...pin,
      });
      expect(prepared.executionMode).toBe('offline_preflight_only');
      expect(prepared.characterCore.sourceRef).toBe(
        'character:' + characterId + ':published:' + 'a'.repeat(64),
      );
      const exactSegment: CharacterContextSegmentV1 = {
        layer: 'character_core',
        ...prepared.characterCore,
      };
      expect(await prepared.sourceAdmission.admit({
        scope: currentScope, segment: exactSegment,
      })).toBe(true);
      expect(await prepared.sourceAdmission.admit({
        scope: { ...currentScope, subjectId: 'other-subject' },
        segment: exactSegment,
      })).toBe(false);
      expect(await prepared.sourceAdmission.admit({
        scope: { ...currentScope, threadId: 'other-thread' },
        segment: exactSegment,
      })).toBe(false);
      expect(await prepared.sourceAdmission.admit({
        scope: { ...currentScope, characterId: 'other-character' },
        segment: exactSegment,
      })).toBe(false);
      expect(await prepared.sourceAdmission.admit({
        scope: currentScope,
        segment: { ...exactSegment, text: 'Forged canon text.' },
      })).toBe(false);
      expect(await prepared.sourceAdmission.admit({
        scope: currentScope,
        segment: { ...exactSegment, sourceRef: 'character:forged' },
      })).toBe(false);
      expect(ports.otherSourceAdmission.admit).not.toHaveBeenCalled();
    },
  );

  it('delegates policy and task to independently pinned authority, never to the character artifact', async () => {
    const ports = harness();
    const prepared = await prepareFourCharacterPublishedContextCoreV1({
      ...ports, scope, pin,
    });
    const policy: CharacterContextSegmentV1 = {
      layer: 'system_safety_product',
      sourceRef: 'policy:approved',
      text: 'Approved policy.',
    };
    expect(await prepared.sourceAdmission.admit({ scope, segment: policy })).toBe(true);
    expect(await prepared.sourceAdmission.admit({
      scope, segment: { ...policy, text: 'Changed policy.' },
    })).toBe(false);
    expect(await prepared.sourceAdmission.admit({
      scope: { ...scope, threadId: 'foreign' }, segment: policy,
    })).toBe(false);
    expect(ports.otherSourceAdmission.admit).toHaveBeenCalledTimes(2);
  });

  it('fails closed for missing/foreign/unpublished/oversized source without leaking text', async () => {
    const base = published();
    const cases: Array<PublishedFourCharacterModelSourceV1 | null> = [
      null,
      { ...base, status: 'pending' } as unknown as PublishedFourCharacterModelSourceV1,
      { ...base, characterId: 'yeoul' },
      { ...base, releaseId: 'other-release' },
      { ...base, bundleId: 'other-bundle' },
      { ...base, contentVersion: 'other-version' },
      { ...base, sourceDigest: 'sha256:v1:invalid' },
      { ...base, bibleSourceRef: base.runtimeSourceRef },
      { ...base, canonicalContext: 'X'.repeat(8001) },
      { ...base, canonicalContext: '' },
    ];
    for (const item of cases) {
      const ports = harness();
      ports.publication.readPublishedSource.mockResolvedValueOnce(item);
      await expect(prepareFourCharacterPublishedContextCoreV1({
        ...ports, scope, pin,
      })).rejects.toMatchObject({
        name: 'FourCharacterDynamicContextSourceHeldV1',
        code: 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD',
      });
      expect(ports.otherSourceAdmission.admit).not.toHaveBeenCalled();
    }
    const ports = harness();
    ports.publication.readPublishedSource.mockRejectedValueOnce(
      new Error('Private artifact load failure.'),
    );
    await expect(prepareFourCharacterPublishedContextCoreV1({
      ...ports, scope, pin,
    })).rejects.not.toThrow('Private artifact load failure.');
  });

  it('rejects non-independent Character or incomplete pinned authority before publication read', async () => {
    const ports = harness();
    await expect(prepareFourCharacterPublishedContextCoreV1({
      ...ports, scope: { ...scope, characterId: 'seyeon' }, pin,
    })).rejects.toMatchObject({ code: 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD' });
    await expect(prepareFourCharacterPublishedContextCoreV1({
      ...ports, scope, pin: { ...pin, releaseId: '' },
    })).rejects.toMatchObject({ code: 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD' });
    expect(ports.publication.readPublishedSource).not.toHaveBeenCalled();
  });

  it('passes only exact published core to the offline composer and counts its exact body', async () => {
    const ports = harness();
    const prepared = await prepareFourCharacterPublishedContextCoreV1({
      ...ports, scope, pin,
    });
    const projection = buildCharacterWorkingMemoryProjectionV1({
      scope: { ...scope, relationshipRevision: null,
        authorizedThreadCharacterIds: ['baekheon'] },
      currentUserMessageRef: 'current-user',
      lifeFacts: [],
      memories: [],
      relationship: null,
      relationshipEvents: [],
      recentMessages: [{
        messageId: 'current-user',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        text: '지난번 이야기 기억나요?',
        createdAt: '2026-11-07T00:00:00.000Z',
      }],
    });
    const retrieval = retrieveCharacterWorkingMemoryV1({
      projection, expectedScope: scope,
      now: '2026-11-08T00:00:00.000Z',
      limit: 3,
    });
    type Request = { output: number; segments: readonly CharacterContextSegmentV1[] };
    const buildExactRequest = vi.fn((segments: readonly CharacterContextSegmentV1[]) => {
      const request: Request = { output: 60, segments };
      return {
        request,
        requestFormat: 'synthetic-json-v1',
        serializedRequestBody: JSON.stringify(request),
        enforcedOutputTokenLimit: 60,
      };
    });
    const countExactRequest = vi.fn(({ serializedRequestBody }: {
      serializedRequestBody: string;
    }) => (JSON.parse(serializedRequestBody) as Request).segments.length * 20 + 10);

    const input = {
      expectedScope: scope,
      context: projection,
      retrieval,
      characterCore: prepared.characterCore,
      sourceAdmission: prepared.sourceAdmission,
      systemSafety: { sourceRef: 'policy:approved', text: 'Approved policy.' },
      responseTask: { sourceRef: 'task:approved', text: 'Answer this turn.' },
      profile: {
        schemaVersion: 'model-token-budget-profile-v1' as const,
        profileId: 'synthetic-only',
        policyVersion: 'offline-fixture-v1',
        providerKey: 'synthetic',
        modelKey: 'fixture-model',
        pricingVersion: 'synthetic-pricing',
        contextWindowTokens: 400,
        maximumInputTokens: 240,
        maximumOutputTokens: 60,
        reservedHeadroomTokens: 10,
        maximumSerializedRequestBytes: 20000,
        tokenCounter: {
          adapterId: 'synthetic-exact',
          adapterVersion: 'v1',
          supportedRequestFormat: 'synthetic-json-v1',
          inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom' as const,
        },
      },
      adapter: {
        adapterId: 'synthetic-exact',
        adapterVersion: 'v1',
        providerKey: 'synthetic',
        modelKey: 'fixture-model',
        supportedRequestFormat: 'synthetic-json-v1',
        reservedHeadroomTokens: 10,
        inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom' as const,
        countExactRequest,
      },
      buildExactRequest,
    };
    const result = await composeCharacterDynamicContextV1<Request>(input);
    expect(result.executionMode).toBe('offline_preflight_only');
    expect(buildExactRequest).toHaveBeenCalledOnce();
    expect(countExactRequest).toHaveBeenCalledOnce();
    expect(result.trace.includedSourceRefs).toContain(prepared.characterCore.sourceRef);
    expect(result.exactRequest.serializedRequestBody)
      .toContain('four-character-canonical-context-v1');
    expect(JSON.stringify(result.trace)).not.toContain('four-character-canonical-context-v1');

    const countBeforeDenied = countExactRequest.mock.calls.length;
    await expect(composeCharacterDynamicContextV1<Request>({
      ...input,
      characterCore: { ...prepared.characterCore, text: 'Changed canonical text.' },
    })).rejects.toMatchObject({ code: 'SOURCE_ADMISSION_DENIED' });
    expect(countExactRequest).toHaveBeenCalledTimes(countBeforeDenied);
  });
});
