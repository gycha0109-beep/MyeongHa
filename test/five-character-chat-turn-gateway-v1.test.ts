import { describe, expect, it, vi } from 'vitest';
import {
  runPublishedFiveCharacterChatTurnV1,
  type FiveCharacterChatTurnExecutorV1,
} from '../apps/api/src/five-character-chat-turn-gateway-v1.js';
import {
  CharacterChatExecutorUnavailableV1,
} from '../apps/api/src/five-character-chat-executor-selection-v1.js';

const subjectId = '12faeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const threadId = '13faeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const releaseId = '14faeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const bundleId = '15faeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const liveTargets = ['seyeon','baekheon','yeoul','rahyeon','taegyeom'] as const;

function fixture(characterId: string, options?: {
  readonly participants?: readonly string[];
  readonly charactersInManifest?: readonly string[];
  readonly returnedThreadId?: string;
  readonly returnedBundleId?: string;
}) {
  const readRuntimeBinding = vi.fn(async () => [{
    threadId: options?.returnedThreadId ?? threadId,
    status: 'active',
    activeContentReleaseId: releaseId,
    activeContentBundleId: bundleId,
    contentRevision: 0,
    participantCharacterIds: options?.participants ?? [characterId],
  }]);
  const readBundleManifest = vi.fn(async () => ({
    contentVersion: 'published-v1',
    minClientCapability: 'web-v1',
    characterIds: options?.charactersInManifest ?? [characterId],
    assetManifestHash: 'approved-asset-manifest',
    cueSchemaVersion: 'v1',
  }));
  return {
    resolvedSubjectId: subjectId,
    threadId,
    clientTurnId: 'client-turn-001',
    text: '오늘은 어땠어요?',
    replyLocale: 'ko-KR' as const,
    bindingAuthorityPort: { readRuntimeBinding },
    manifestAuthorityPort: { readBundleManifest },
    readRuntimeBinding,
    readBundleManifest,
  };
}

describe('owner-pinned five-Character execution gateway', () => {
  it.each(liveTargets)('executes only the installed %s runtime after authoritative reads', async characterId => {
    const owner = fixture(characterId);
    const executor = vi.fn<FiveCharacterChatTurnExecutorV1<{
      observedCharacterId: string;
      observedReleaseId: string;
      observedBundleId: string;
    }>>(async (turn) => ({
      observedCharacterId: turn.characterId,
      observedReleaseId: turn.pinnedReleaseId,
      observedBundleId: turn.pinnedBundleId,
    }));
    const result = await runPublishedFiveCharacterChatTurnV1({
      ...owner,
      registeredExecutors: { [characterId]: executor },
    });
    expect(result.characterId).toBe(characterId);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.execution).toEqual({
      observedCharacterId: characterId,
      observedReleaseId: releaseId,
      observedBundleId: bundleId,
    });
    expect(executor.mock.calls[0]?.[0]).toMatchObject({
      characterId, subjectId, threadId,
      clientTurnId: 'client-turn-001',
      pinnedReleaseId: releaseId, pinnedBundleId: bundleId,
      text: '오늘은 어땠어요?',
    });
    expect(owner.readRuntimeBinding).toHaveBeenCalledWith({ subjectId, threadId });
    expect(owner.readBundleManifest).toHaveBeenCalledWith({ contentBundleId: bundleId });
  });

  it.each(liveTargets.slice(1))('does not call Se-yeon when %s executor is unavailable', async characterId => {
    const seyeon = vi.fn(async () => 'should-not-run');
    const { readRuntimeBinding, readBundleManifest, ...input } = fixture(characterId);
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...input,
      registeredExecutors: { seyeon },
    })).rejects.toThrow(CharacterChatExecutorUnavailableV1);
    expect(seyeon).not.toHaveBeenCalled();
    expect(readRuntimeBinding).toHaveBeenCalledOnce();
    expect(readBundleManifest).toHaveBeenCalledOnce();
  });

  it('rejects unrequested Yunho even when a caller attempts to register him', async () => {
    const forbidden = vi.fn(async () => 'should-not-run');
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...fixture('yunho'),
      registeredExecutors: { yunho: forbidden } as never,
    })).rejects.toThrow(CharacterChatExecutorUnavailableV1);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('rejects foreign-Subject/mismatched-thread reads before any model work', async () => {
    const runtime = vi.fn(async () => 'should-not-run');
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...fixture('yeoul', { returnedThreadId: 'foreign-thread' }),
      registeredExecutors: { yeoul: runtime },
    })).rejects.toThrow('different thread identity');
    expect(runtime).not.toHaveBeenCalled();
  });

  it('rejects multi-Character participants or missing pinned manifest identity', async () => {
    const runtime = vi.fn(async () => 'should-not-run');
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...fixture('baekheon', { participants: ['baekheon','seyeon'] }),
      registeredExecutors: { baekheon: runtime },
    })).rejects.toThrow(CharacterChatExecutorUnavailableV1);
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...fixture('baekheon', { charactersInManifest: ['seyeon'] }),
      registeredExecutors: { baekheon: runtime },
    })).rejects.toThrow(CharacterChatExecutorUnavailableV1);
    expect(runtime).not.toHaveBeenCalled();
  });

  it('rejects invalid text before DB reads or execution', async () => {
    const owner = fixture('rahyeon');
    const runtime = vi.fn(async () => 'should-not-run');
    await expect(runPublishedFiveCharacterChatTurnV1({
      ...owner, text: ' '.repeat(40), registeredExecutors: { rahyeon: runtime },
    })).rejects.toThrow('text is outside allowed bounds');
    expect(owner.readRuntimeBinding).not.toHaveBeenCalled();
    expect(owner.readBundleManifest).not.toHaveBeenCalled();
    expect(runtime).not.toHaveBeenCalled();
  });
});
