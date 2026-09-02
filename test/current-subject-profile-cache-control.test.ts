import { describe, expect, it } from 'vitest';
import {
  handleCurrentSubjectProfileRequestV1,
  type IdentityEvidenceVerificationPortV1,
} from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const SUBJECT_ID = '92000000-0000-0000-0000-000000000001';

class FakeVerifier implements IdentityEvidenceVerificationPortV1 {
  constructor(readonly result: VerifiedSubjectIdentityEvidenceV1 | null) {}

  verifyRequestIdentity(): VerifiedSubjectIdentityEvidenceV1 | null {
    return this.result;
  }
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  async query<Row = Record<string, unknown>>(
    text: string,
  ): Promise<PostgresQueryResultV1<Row>> {
    if (text.includes('begin_member_subject_context_v1')) {
      return {
        rows: ([{ subjectId: SUBJECT_ID, subjectKind: 'member' }] as unknown) as readonly Row[],
      };
    }

    if (text.includes('qry_subject_profile_current_v1')) {
      return {
        rows: ([
          {
            subjectId: SUBJECT_ID,
            subjectKind: 'member',
            subjectStatus: 'active',
            displayName: null,
            locale: null,
            timezone: null,
            onboardingState: null,
            profileUpdatedAt: null,
          },
        ] as unknown) as readonly Row[],
      };
    }

    return { rows: [] };
  }

  release(): void {}
}

class FakePool implements PostgresSubjectPoolV1 {
  connect(): PostgresSubjectConnectionV1 {
    return new FakeConnection();
  }
}

function input(
  verifier: IdentityEvidenceVerificationPortV1,
  request = new Request('https://myeongha.test/api/me'),
) {
  return {
    request,
    requestId: 'req-cache-control',
    serverTime: '2026-09-03T00:00:00.000Z',
    identityEvidenceVerifier: verifier,
    pool: new FakePool(),
  };
}

describe('current subject profile cache control', () => {
  it('marks authenticated profile responses as no-store', async () => {
    const response = await handleCurrentSubjectProfileRequestV1(
      input(
        new FakeVerifier({
          kind: 'member',
          verifiedAuthUserId: AUTH_USER_ID,
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        subjectId: SUBJECT_ID,
        subjectKind: 'member',
      },
    });
  });

  it('marks unauthenticated responses as no-store', async () => {
    const response = await handleCurrentSubjectProfileRequestV1(
      input(new FakeVerifier(null)),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('marks method rejection responses as no-store', async () => {
    const response = await handleCurrentSubjectProfileRequestV1(
      input(
        new FakeVerifier(null),
        new Request('https://myeongha.test/api/me', { method: 'POST' }),
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
