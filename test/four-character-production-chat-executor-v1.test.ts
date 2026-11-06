import { describe, expect, it, vi } from 'vitest';
import {
  FOUR_INDEPENDENT_CHAT_TARGETS_V1,
  FourCharacterProductionExecutionHeldV1,
  createFourCharacterProductionChatExecutorV1,
  type FourCharacterProductionExecutionPortsV1,
  type FourIndependentChatTargetV1,
  type PublishedFourCharacterModelSourceV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';
import type {
  TrustedFiveCharacterChatTurnV1,
} from '../apps/api/src/five-character-chat-turn-gateway-v1.js';

const subjectId='11111111-1111-4111-8111-111111111111';
const threadId='22222222-2222-4222-8222-222222222222';
const releaseId='33333333-3333-4333-8333-333333333333';
const bundleId='44444444-4444-4444-8444-444444444444';

function turnFor(characterId: FourIndependentChatTargetV1): TrustedFiveCharacterChatTurnV1 {
  const binding = Object.freeze({
    threadId,
    activeContentReleaseId: releaseId,
    activeContentBundleId: bundleId,
    contentRevision: 0,
    participantCharacterIds: [characterId],
  });
  const manifest = Object.freeze({
    contentBundleId: bundleId,
    manifest: Object.freeze({
      contentVersion: 'approved-published-v1',
      characterIds: [characterId],
      minClientCapability: 'character-chat-v1',
      assetManifestHash: 'approved-asset-hash',
      cueSchemaVersion: 'static-cue-v1',
    }),
  });
  return Object.freeze({
    characterId, subjectId, threadId,
    clientTurnId: 'client-turn-test', text: '안녕하세요.',
    replyLocale: 'ko-KR',
    pinnedReleaseId: releaseId,
    pinnedBundleId: bundleId,
    threadBinding: binding,
    bundleManifest: manifest,
  });
}

function harness(characterId: FourIndependentChatTargetV1) {
  const calls: string[] = [];
  const source: PublishedFourCharacterModelSourceV1 = {
    status: 'published',
    characterId, releaseId, bundleId,
    contentVersion: 'approved-published-v1',
    assetManifestHash: 'approved-asset-hash',
    cueSchemaVersion: 'static-cue-v1',
    bibleSourceRef: 'approved://bible/'+characterId,
    runtimeSourceRef: 'approved://runtime/'+characterId,
    sourceDigest: 'sha256:test-source-'+characterId,
    canonicalContext: '서버에서 승인된 개별 캐릭터의 런타임 문맥',
  };
  const reservation = {
    status: 'reserved' as const,
    subjectId, threadId, characterId, releaseId, bundleId,
    turnId: 'turn-1', attemptId: 'attempt-1', costReservationId: 'cost-1',
  };
  const generated = {
    characterId, bodyText: '테스트 응답 원문',
    providerKey: 'approved-independent-provider', modelKey: 'approved-model',
    usage: { inputTokens: 10, outputTokens: 8 },
  };
  const validated = {
    characterId, bodyText: '검증된 응답 본문',
    approved: true as const,
    outputGuardVersion: 'approved-output-guard-v1',
    groundingRefs: ['source:approved'],
  };
  const receipt = {
    status: 'issued_pending_ack' as const,
    subjectId, threadId, characterId,
    turnId: 'turn-1', attemptId: 'attempt-1',
    assistantMessageId: 'assistant-1', deliveryReceiptId: 'receipt-1',
  };
  const readPublishedSource = vi.fn(async () => {
    calls.push('source');
    return source as PublishedFourCharacterModelSourceV1 | null;
  });
  const reserveAttempt = vi.fn<FourCharacterProductionExecutionPortsV1['transaction']['reserveAttempt']>(
    async () => {
      calls.push('reserve');
      return reservation;
    },
  );
  const generate = vi.fn(async () => {
    calls.push('model');
    return generated;
  });
  const validate = vi.fn(async () => {
    calls.push('guard');
    return validated;
  });
  const commitValidatedAndIssue = vi.fn(async () => {
    calls.push('commit');
    return receipt;
  });
  const failAttempt = vi.fn(async () => {
    calls.push('failed');
  });
  const ports: FourCharacterProductionExecutionPortsV1 = {
    publication: { readPublishedSource },
    transaction: { reserveAttempt, commitValidatedAndIssue, failAttempt },
    provider: { generate },
    outputGuard: { validate },
  };
  return {
    ports, calls, source, reservation, generated, validated, receipt,
    readPublishedSource, reserveAttempt, generate, validate,
    commitValidatedAndIssue, failAttempt,
  };
}

describe('four independent published Character AI execution', () => {
  it.each(FOUR_INDEPENDENT_CHAT_TARGETS_V1)(
    'reserves cost, runs only %s approved source, persists and issues a held receipt',
    async characterId => {
      const h=harness(characterId);
      const result=await createFourCharacterProductionChatExecutorV1(characterId,h.ports)(
        turnFor(characterId),
      );
      expect(h.calls).toEqual(['source','reserve','model','guard','commit']);
      expect(h.readPublishedSource).toHaveBeenCalledWith({
        characterId, releaseId, bundleId, contentVersion: 'approved-published-v1',
      });
      expect(h.reserveAttempt).toHaveBeenCalledWith(expect.objectContaining({
        characterId, subjectId, threadId,
        clientTurnId: 'client-turn-test', sourceDigest: h.source.sourceDigest,
      }));
      expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({
        source: h.source,
        reservation: h.reservation,
        turn: expect.objectContaining({ characterId, pinnedReleaseId: releaseId }),
      }));
      expect(h.commitValidatedAndIssue).toHaveBeenCalledWith({
        reservation: h.reservation,
        source: h.source,
        generated: h.generated,
        validated: h.validated,
      });
      expect(result).toEqual({
        disposition: 'committed_pending_delivery', characterId,
        turnId: 'turn-1', assistantMessageId: 'assistant-1', deliveryReceiptId: 'receipt-1',
      });
      // Model content cannot leak through the pre-delivery return value.
      expect(JSON.stringify(result)).not.toContain(h.generated.bodyText);
      expect(JSON.stringify(result)).not.toContain(h.validated.bodyText);
      expect(h.failAttempt).not.toHaveBeenCalled();
    },
  );

  it('never installs Se-yeon or Yunho as a four-Character executor', () => {
    const h=harness('baekheon');
    expect(() => createFourCharacterProductionChatExecutorV1('seyeon' as never,h.ports))
      .toThrow(FourCharacterProductionExecutionHeldV1);
    expect(() => createFourCharacterProductionChatExecutorV1('yunho' as never,h.ports))
      .toThrow(FourCharacterProductionExecutionHeldV1);
  });

  it('rejects cross-Character pinned bindings before source, receive or model', async () => {
    const h=harness('yeoul');
    await expect(createFourCharacterProductionChatExecutorV1('yeoul',h.ports)(
      turnFor('rahyeon'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.calls).toEqual([]);
  });

  it('rejects missing or mismatched published source before cost/AI', async () => {
    const h=harness('taegyeom');
    h.readPublishedSource.mockResolvedValueOnce(null);
    await expect(createFourCharacterProductionChatExecutorV1('taegyeom',h.ports)(
      turnFor('taegyeom'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.reserveAttempt).not.toHaveBeenCalled();

    h.readPublishedSource.mockResolvedValueOnce({
      ...h.source, runtimeSourceRef: ' ', contentVersion: 'wrong-version',
    });
    await expect(createFourCharacterProductionChatExecutorV1('taegyeom',h.ports)(
      turnFor('taegyeom'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('rejects replayed/in-flight reservations before any Provider call', async () => {
    const h=harness('baekheon');
    h.reserveAttempt.mockResolvedValueOnce({ ...h.reservation, status: 'replayed' });
    await expect(createFourCharacterProductionChatExecutorV1('baekheon',h.ports)(
      turnFor('baekheon'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.failAttempt).not.toHaveBeenCalled();
  });

  it('records a bounded failed attempt on a Provider exception', async () => {
    const h=harness('rahyeon');
    h.generate.mockImplementationOnce(async () => {
      h.calls.push('model');
      throw new Error('upstream service unavailable');
    });
    await expect(createFourCharacterProductionChatExecutorV1('rahyeon',h.ports)(
      turnFor('rahyeon'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.calls).toEqual(['source','reserve','model','failed']);
    expect(h.failAttempt).toHaveBeenCalledWith({
      reservation: h.reservation,
      failureCode: 'CHARACTER_EXECUTION_FAILED',
    });
    expect(h.commitValidatedAndIssue).not.toHaveBeenCalled();
  });

  it('blocks unapproved or wrong-Character model output and records failure', async () => {
    const h=harness('yeoul');
    h.generate.mockResolvedValueOnce({ ...h.generated, characterId: 'seyeon' as never });
    await expect(createFourCharacterProductionChatExecutorV1('yeoul',h.ports)(
      turnFor('yeoul'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.validate).not.toHaveBeenCalled();
    expect(h.failAttempt).toHaveBeenCalledOnce();
  });

  it('blocks invalid output guard verdict without issuing a receipt', async () => {
    const h=harness('baekheon');
    h.validate.mockResolvedValueOnce({ ...h.validated, approved: false as never });
    await expect(createFourCharacterProductionChatExecutorV1('baekheon',h.ports)(
      turnFor('baekheon'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.commitValidatedAndIssue).not.toHaveBeenCalled();
    expect(h.failAttempt).toHaveBeenCalledOnce();
  });

  it('does not accept receipt from a foreign Member or completed ACK', async () => {
    const h=harness('taegyeom');
    h.commitValidatedAndIssue.mockResolvedValueOnce({
      ...h.receipt, subjectId: 'foreign',
      status: 'issued_pending_ack',
    });
    await expect(createFourCharacterProductionChatExecutorV1('taegyeom',h.ports)(
      turnFor('taegyeom'),
    )).rejects.toThrow(FourCharacterProductionExecutionHeldV1);
    expect(h.failAttempt).toHaveBeenCalledOnce();
  });
});
