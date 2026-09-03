import { describe, expect, it } from 'vitest';
import { handleBirthProfileCreateRequestV1 } from '../apps/api/src/birth-profile-create-http.js';
import type { BirthInputFingerprintPortV1, BirthProfileCreateIdPortV1 } from '../apps/api/src/birth-profile-create-command.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const identityEvidenceVerifier: IdentityEvidenceVerificationPortV1 = {
  verifyRequestIdentity() {
    return Object.freeze({
      kind: 'guest',
      verifiedGuestTokenHash: 'myeongha-guest-bearer-hmac-sha256-v1:date-format-test',
    });
  },
};

const idPort: BirthProfileCreateIdPortV1 = {
  nextBirthProfileId: () => 'b7300000-0000-0000-0000-000000000001',
  nextBirthRevisionId: () => 'b7400000-0000-0000-0000-000000000001',
};

const fingerprintPort: BirthInputFingerprintPortV1 = {
  fingerprintBirthInput: () => `hmac-sha256:k1:${'a'.repeat(64)}`,
};

describe('Birth Profile birth-date format boundary', () => {
  it('rejects expanded years before opening PostgreSQL', async () => {
    let connectCalls = 0;
    const pool = {
      connect() {
        connectCalls += 1;
        throw new Error('PostgreSQL must not be opened for an invalid birth date.');
      },
    } as PostgresSubjectPoolV1;

    const response = await handleBirthProfileCreateRequestV1({
      request: new Request('https://myeongha.vercel.app/api/birth-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: null,
          input: {
            calendarType: 'solar',
            birthDate: '199555-09-10',
            birthTime: '09:10',
            timeKnown: true,
            isLeapMonth: false,
            sex: 'male',
          },
        }),
      }),
      requestId: 'request-expanded-year-1',
      serverTime: '2026-09-03T17:40:00.000Z',
      identityEvidenceVerifier,
      pool,
      idPort,
      fingerprintPort,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(connectCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });
});
