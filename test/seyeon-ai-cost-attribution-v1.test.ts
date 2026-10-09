import { describe, expect, it } from 'vitest';
import {
  attributeSeyeonAiCostCallV1,
  summarizeSeyeonAttributedTurnCostsV1,
} from '../apps/api/src/seyeon-ai-cost-attribution-v1.js';
import { createSeyeonAiCostEventV1 } from '../apps/api/src/seyeon-ai-usage-cost-v1.js';

function event(callId: string, purpose: string, priced = true) {
  return createSeyeonAiCostEventV1({
    callId, purpose, providerKey: 'openai-responses', modelKey: 'stub',
    outcome: 'response_received', httpStatus: 200, elapsedMs: 12,
    usage: { inputTokens: 50, cachedInputTokens: 0, outputTokens: 25, reasoningTokens: 0 },
    ...(priced ? { price: {
      priceVersion: 'test-v1', providerKey: 'openai-responses',
      modelKey: 'stub', inputMicroUsdPerMillion: 1_000_000,
      cachedInputMicroUsdPerMillion: 250_000,
      outputMicroUsdPerMillion: 4_000_000,
    } } : {}),
  });
}
const inline = (callId: string, attemptId = 'attempt-1', priced = true) =>
  attributeSeyeonAiCostCallV1({
    subjectId: 'subject-1', threadId: 'thread-1', turnId: 'turn-1',
    attemptId, stage: 'dialogue_render', event: event(callId, 'dialogue_render', priced),
  });
const postTurn = () => attributeSeyeonAiCostCallV1({
  subjectId: 'subject-1', threadId: 'thread-1', turnId: 'turn-1',
  postTurnOutboxEventId: 'outbox-1', stage: 'event_extraction',
  event: event('post-call', 'event_extraction'),
});
const summarize = (calls: readonly ReturnType<typeof inline>[]) =>
  summarizeSeyeonAttributedTurnCostsV1({
    subjectId: 'subject-1', threadId: 'thread-1', turnId: 'turn-1', calls,
  });

describe('Se-yeon attributed cost v1 (offline)', () => {
  it('attributes retries and post-turn extraction without double-charging a replay', () => {
    const first = inline('call-1');
    const retry = inline('call-2', 'attempt-2');
    const delayed = postTurn();
    const result = summarize([first, first, retry, delayed]);
    expect(result).toMatchObject({
      callCount: 3, attempts: 2, postTurnCalls: 1,
      failedCalls: 0, knownCostMicroUsd: 450,
      unknownCostCalls: 0, totalEstimatedCostMicroUsd: 450,
    });
  });
  it('rejects cross-subject or cross-turn cost attribution', () => {
    expect(() => summarize([
      { ...inline('call-1'), subjectId: 'other-subject' },
    ])).toThrow('different canonical turn');
  });
  it('rejects conflicting duplicate call IDs', () => {
    expect(() => summarize([inline('call-1'), inline('call-1', 'attempt-2')]))
      .toThrow('conflicting attribution');
  });
  it('requires post-turn identity and forbids inline outbox attribution', () => {
    expect(() => attributeSeyeonAiCostCallV1({
      subjectId: 's', threadId: 't', turnId: 'u',
      stage: 'event_extraction', event: event('call-1', 'event_extraction'),
    })).toThrow('outbox event');
    expect(() => attributeSeyeonAiCostCallV1({
      subjectId: 's', threadId: 't', turnId: 'u',
      attemptId: 'a', stage: 'dialogue_render',
      event: event('call-2', 'semantic_review'),
    })).toThrow('stage/purpose mismatch');
  });
  it('keeps missing model price unknown in the turn total', () => {
    expect(summarize([inline('call-1'), inline('call-2', 'attempt-2', false)]))
      .toMatchObject({ knownCostMicroUsd: 150,
        unknownCostCalls: 1, totalEstimatedCostMicroUsd: null });
  });
});
