import { describe, expect, it } from 'vitest';
import { createVerifiedSajuReadingProviderBindingAuthorityV1 } from './reading-ai-saju-binding-authority-v1.js';

const request = {
  sajuRequestId: 'saju-private-request-1',
  callId: '123e4567-e89b-42d3-a456-426614174003',
  modelKey: 'fixture-model',
  observedAt: '2026-11-09T00:00:00.000Z',
  observation: {
    callId: '123e4567-e89b-42d3-a456-426614174003',
    requestId: 'saju-private-request-1', modelKey: 'fixture-model',
    observedAt: '2026-11-09T00:00:00.000Z', providerKey: 'openai' as const,
    source: 'provider_response_usage' as const, outcome: 'response_received' as const,
    usage: {inputTokens:10,outputTokens:5,cachedInputTokens:0,reasoningTokens:0},
  },
};
const sourceProof = {
  ...request,
  externalRequestRef: 'verified-external-ref-1',
  executionAttemptId: '123e4567-e89b-42d3-a456-426614174002',
};
const dbProof = {
  externalRequestRef: sourceProof.externalRequestRef,
  executionAttemptId: sourceProof.executionAttemptId,
  readingId: '123e4567-e89b-42d3-a456-426614174001',
  subjectId: '123e4567-e89b-42d3-a456-426614174000',
};
function fixture(
  source = sourceProof as typeof sourceProof | null,
  db = dbProof as typeof dbProof | null,
) {
  const calls: string[] = [];
  const authority = createVerifiedSajuReadingProviderBindingAuthorityV1({
    source: {
      async verifyProviderCall(input) {
        calls.push('source:' + input.callId);
        return source;
      },
    },
    db: {
      async verifyDbAttempt(input) {
        calls.push('db:' + input.executionAttemptId);
        return db;
      },
    },
  });
  return { authority, calls };
}

describe('Saju provider source-to-DB Reading attempt binding authority', () => {
  it('resolves only a source-proven request/call with exact governed DB attempt', async () => {
    const x = fixture();
    await expect(x.authority.resolve(request)).resolves.toEqual({
      subjectId: dbProof.subjectId,
      readingId: dbProof.readingId,
      executionAttemptId: dbProof.executionAttemptId,
    });
    expect(x.calls).toEqual([
      'source:' + request.callId,
      'db:' + dbProof.executionAttemptId,
    ]);
  });
  it('never falls back from missing or mismatched source provenance to DB guessing', async () => {
    for (const source of [
      null,
      { ...sourceProof, sajuRequestId: 'different-source' },
      { ...sourceProof, callId: '123e4567-e89b-42d3-a456-426614174099' },
      { ...sourceProof, modelKey: 'another-model' },
      { ...sourceProof, externalRequestRef: '' },
      { ...sourceProof, executionAttemptId: 'not-a-db-uuid' },
    ]) {
      const x = fixture(source);
      await expect(x.authority.resolve(request)).resolves.toBeNull();
      expect(x.calls).toHaveLength(1);
    }
  });
  it('rejects missing, ambiguous, or mismatched canonical DB identity', async () => {
    for (const db of [
      null,
      { ...dbProof, executionAttemptId: '123e4567-e89b-42d3-a456-426614174088' },
      { ...dbProof, externalRequestRef: 'another-transport-ref' },
      { ...dbProof, readingId: 'not-a-uuid' },
    ]) {
      const x = fixture(sourceProof, db);
      await expect(x.authority.resolve(request)).resolves.toBeNull();
      expect(x.calls).toHaveLength(2);
    }
  });
  it('rejects unauthenticated or malformed correlation before contacting either authority', async () => {
    const x = fixture();
    await expect(x.authority.resolve({ ...request, callId: 'caller-chosen-id' })).resolves.toBeNull();
    await expect(x.authority.resolve({ ...request, observedAt: 'invalid-time' })).resolves.toBeNull();
    expect(x.calls).toEqual([]);
  });
});
