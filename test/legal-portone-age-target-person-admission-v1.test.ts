import { describe, expect, it, vi } from 'vitest';
import { handleTargetPersonCreateRequestV1 } from '../apps/api/src/target-person-create-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

describe('PortOne age admission at Target Person create', () => {
  it('requires a verified owner age for Member and Guest; no target DOB grants admission', async () => {
    for (const kind of ['member', 'guest'] as const) {
      const connect = vi.fn(async () => { throw new Error('must not connect'); });
      const pool = { connect } as unknown as PostgresSubjectPoolV1;
      const ageAdmissionPort = {
        admitFreePersonalization: vi.fn(async () => false),
      };
      const evidence = kind === 'member'
        ? { kind: 'member' as const, verifiedAuthUserId: '90000000-0000-0000-0000-000000000001' }
        : { kind: 'guest' as const, verifiedGuestTokenHash: 'verified-guest-fingerprint' };
      const response = await handleTargetPersonCreateRequestV1({
        request: new Request('https://myeongha.example/api/target-persons', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayLabel: 'A', relationshipLabel: 'friend',
            input: {
              calendarType: 'solar', birthDate: '1990-03-05',
              birthTime: '10:00', timeKnown: true, isLeapMonth: false, sex: 'female',
            },
          }),
        }),
        requestId: 'age-target-test',
        serverTime: '2026-10-24T00:00:00.000Z',
        identityEvidenceVerifier: { verifyRequestIdentity: async () => evidence },
        pool,
        idPort: {
          nextTargetPersonId: () => '82000000-0000-0000-0000-000000000001',
          nextBirthProfileId: () => '83000000-0000-0000-0000-000000000001',
          nextBirthRevisionId: () => '84000000-0000-0000-0000-000000000001',
        },
        fingerprintPort: { fingerprintBirthInput: () => 'hmac-sha256:k1:deadbeef' },
        ageAdmissionPort,
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('AGE_VERIFICATION_REQUIRED');
      expect(ageAdmissionPort.admitFreePersonalization).toHaveBeenCalledWith(evidence);
      expect(connect).not.toHaveBeenCalled();
    }
  });
});
