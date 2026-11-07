// Watchtower-Track: character-runtime-lab
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyTaegyeomLanguageTransportFailure as classify } from './classify-taegyeom-language-transport-failure.mjs';

test('names only approved DNS and connection codes', () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET',
    'UND_ERR_CONNECT_TIMEOUT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']) {
    const error = new TypeError('fetch failed', {
      cause: Object.assign(new Error('sensitive provider detail'), { code }),
    });
    assert.equal(classify(error), 'LANGUAGE_AB_TRANSPORT_' + code + '_HOLD');
  }
});

test('timeout and abort errors are bounded', () => {
  assert.equal(classify(Object.assign(new Error('secret'), { name: 'TimeoutError' })),
    'LANGUAGE_AB_TRANSPORT_TIMEOUT_HOLD');
  assert.equal(classify(Object.assign(new Error('secret'), { name: 'AbortError' })),
    'LANGUAGE_AB_TRANSPORT_TIMEOUT_HOLD');
});

test('unexpected errors do not expose content or arbitrary error codes', () => {
  const secret = 'sk-sensitive-secret-must-never-print';
  const unusual = new TypeError('fetch failed ' + secret, {
    cause: Object.assign(new Error(secret), { code: 'INJECT_' + secret }),
  });
  const got = classify(unusual);
  assert.equal(got, 'LANGUAGE_AB_TRANSPORT_UNCLASSIFIED_HOLD');
  assert.equal(got.includes(secret), false);
  assert.equal(classify(null), 'LANGUAGE_AB_TRANSPORT_UNCLASSIFIED_HOLD');
});
