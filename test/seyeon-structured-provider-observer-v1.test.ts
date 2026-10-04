import { describe, expect, it } from 'vitest';

import {
  createObservedSeyeonStructuredProviderV1,
  diffSeyeonStructuredProviderInvocationsV1,
} from '../apps/api/src/seyeon-structured-provider-observer-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

function request(
  purpose: SeyeonStructuredProviderRequestV2['purpose'],
): SeyeonStructuredProviderRequestV2 {
  return {
    contractVersion: 'seyeon-structured-provider-v2',
    purpose,
    instructions: 'test',
    input: {},
    responseSchema: {},
  };
}

describe('Se-yeon structured provider observer V1', () => {
  it('counts calls by purpose without changing provider identity', async () => {
    const delegate = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate(input: SeyeonStructuredProviderRequestV2) {
        return { purpose: input.purpose };
      },
    };
    const observed = createObservedSeyeonStructuredProviderV1(delegate);

    await observed.provider.generate(request('turn_interpretation'));
    await observed.provider.generate(request('dialogue_render'));
    await observed.provider.generate(request('dialogue_render'));

    expect(observed.provider.providerKey).toBe('test-provider');
    expect(observed.provider.modelKey).toBe('test-model');
    expect(observed.snapshot()).toEqual({
      version: 'seyeon-structured-provider-observer-v1',
      providerKey: 'test-provider',
      modelKey: 'test-model',
      total: 3,
      byPurpose: {
        integrity_classification: 0,
        disclosure_classification: 0,
        turn_interpretation: 1,
        dialogue_render: 2,
        semantic_review: 0,
        event_extraction: 0,
      },
    });
  });

  it('produces an invocation delta without exposing request payloads', async () => {
    const delegate = {
      providerKey: 'test-provider',
      modelKey: 'test-model',
      async generate() {
        return {};
      },
    };
    const observed = createObservedSeyeonStructuredProviderV1(delegate);
    const before = observed.snapshot();

    await observed.provider.generate(request('event_extraction'));

    expect(
      diffSeyeonStructuredProviderInvocationsV1(
        before,
        observed.snapshot(),
      ),
    ).toEqual({
      version: 'seyeon-structured-provider-observer-v1',
      providerKey: 'test-provider',
      modelKey: 'test-model',
      total: 1,
      byPurpose: {
        integrity_classification: 0,
        disclosure_classification: 0,
        turn_interpretation: 0,
        dialogue_render: 0,
        semantic_review: 0,
        event_extraction: 1,
      },
    });
  });
});
