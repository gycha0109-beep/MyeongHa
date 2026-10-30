import { describe, expect, it, vi } from 'vitest';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  createSeyeonC09PrivateLearningOptinCommandShadowV1,
  C09_PRIVATE_OPTIN_ORIGINAL_SQL_V1,
  C09_PRIVATE_OPTIN_RECEIPT_SQL_V1,
  C09_PRIVATE_OPTIN_CAPTURE_SQL_V1,
} from '../apps/api/src/seyeon-c09-private-learning-optin-command-shadow-v1.js';
import {
  POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-private-approved-source-shadow-v1.js';
import {
  POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-publication-source-shadow-v1.js';

const AUTH = '91000000-0000-4000-8000-000000000001';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE = '11111111-1111-4111-8111-111111111111';
const SOURCE = 'c09:conversation:' + MESSAGE;
const CREATED = '2026-10-28T03:00:00.000Z';
const VERIFIED = '2026-10-29T03:00:00.000Z';

type Calls = { text: string; values: readonly unknown[] };

function fixture(options: {
  missingOriginal?: boolean;
  wrongSubject?: boolean;
  missingReceipt?: boolean;
  badProof?: boolean;
  failInsert?: boolean;
  badTopic?: boolean;
  missingCapture?: boolean;
} = {}) {
  const calls: Calls[] = [];
  const releases: unknown[] = [];
  let approval = '';
  const connection: PostgresSubjectConnectionV1 = {
    release: (reason?: unknown) => { releases.push(reason); },
    async query<Row = Record<string, unknown>>(
      text: string, values: readonly unknown[] = [],
    ): Promise<PostgresQueryResultV1<Row>> {
      calls.push({ text, values });
      let rows: Record<string, unknown>[] = [];
      if (text.includes('begin_member_subject_context_v1')) {
        rows = [{ subjectId: options.wrongSubject ? OTHER : OWNER, subjectKind: 'member' }];
      } else if (text === C09_PRIVATE_OPTIN_ORIGINAL_SQL_V1) {
        expect(values).toEqual([MESSAGE, options.wrongSubject ? OTHER : OWNER]);
        rows = options.missingOriginal ? [] : [
          { contentHash: 'fixed-original-hash', bodyText: 'teach this private fact',
            createdAt: CREATED },
        ];
      } else if (text === C09_PRIVATE_OPTIN_RECEIPT_SQL_V1) {
        if (options.failInsert) throw new Error('duplicate receipt');
        approval = values[0] as string;
        expect(approval).toMatch(/^c09:member-private-optin:/u);
        expect(values.slice(1)).toEqual([
          options.wrongSubject ? OTHER : OWNER, MESSAGE, 'fixed-original-hash',
        ]);
        rows = options.missingReceipt ? [] : [{
          actionRef: approval, subjectId: values[1], messageId: MESSAGE,
        }];
      } else if (text === C09_PRIVATE_OPTIN_CAPTURE_SQL_V1) {
        expect(values).toEqual([
          SOURCE, options.wrongSubject ? OTHER : OWNER, MESSAGE,
          approval, 'python.programming', 'heard_of', VERIFIED, VERIFIED,
        ]);
        rows = options.missingCapture ? [] : [{ sourceRef: SOURCE }];
      } else if (text === POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1) {
        rows = [{ currentlyVerified: !options.badProof }];
      } else if (text === POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1) {
        rows = [{
          subjectId: options.wrongSubject ? OTHER : OWNER,
          sourceRef: SOURCE, characterId: 'seyeon', topicKey: 'python.programming',
          sourceKind: 'user_taught_verified', awareness: 'heard_of',
          visibility: 'user_private', sourceSubjectId: options.wrongSubject ? OTHER : OWNER,
          approvalRef: approval, verifiedAt: VERIFIED, learnedAt: VERIFIED,
          validAt: VERIFIED, sharingConsentRef: null, privacyReviewRef: null,
          privacyReviewedAt: null, deidentifiedForSharing: false,
          sourceVerificationRef: 'conversation:' + MESSAGE + ':sha:fixed-original-hash',
        }];
      }
      return { rows: rows as Row[] };
    },
  };
  const topicAuthority = {
    decide: vi.fn(async (input: {
      subjectId: string; messageId: string; originalContentHash: string;
      originalBodyText: string; originalCreatedAt: string;
    }) => {
      expect(input).toEqual({
        subjectId: options.wrongSubject ? OTHER : OWNER,
        messageId: MESSAGE, originalContentHash: 'fixed-original-hash',
        originalBodyText: 'teach this private fact', originalCreatedAt: CREATED,
      });
      if (options.badTopic) return { serverApproved: false };
      return {
        serverApproved: true, topicKey: 'python.programming',
        awareness: 'heard_of', learnedAt: VERIFIED, validAt: VERIFIED,
      };
    }),
  };
  const command = createSeyeonC09PrivateLearningOptinCommandShadowV1({
    pool: { connect: () => connection } as PostgresSubjectPoolV1,
    topicAuthority,
  });
  const submit = (userAction: Record<string, unknown> = {
    action: 'approve_private_learning', originalMessageId: MESSAGE,
  }, evidence: Record<string, unknown> = {
    kind: 'member', verifiedAuthUserId: AUTH,
  }) => command.submit({
    verifiedEvidence: evidence as Parameters<typeof command.submit>[0]['verifiedEvidence'],
    userAction: userAction as unknown as Parameters<typeof command.submit>[0]['userAction'],
  });
  return { calls, releases, submit, topicAuthority };
}

describe('C09 auth-bound explicit private learning opt-in command shadow', () => {
  it('uses the verified member Subject for receipt, source capture and current private Authority', async () => {
    const f = fixture();
    const result = await f.submit();
    expect(result).toMatchObject({
      sourceRef: SOURCE, scope: 'user_private',
      evidencePublished: false, productionActivated: false,
    });
    expect(result.actionRef).toMatch(/^c09:member-private-optin:/u);
    const texts = f.calls.map(c => c.text);
    expect(texts).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_member_subject_context_v1'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      C09_PRIVATE_OPTIN_ORIGINAL_SQL_V1,
      C09_PRIVATE_OPTIN_RECEIPT_SQL_V1,
      C09_PRIVATE_OPTIN_CAPTURE_SQL_V1,
      POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1,
      POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1,
      POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1,
      'COMMIT',
    ]);
    expect(f.calls[2]?.values).toEqual([AUTH]);
    expect(f.calls[3]?.values).toEqual([OWNER]);
    expect(f.releases).toEqual([undefined]);
    expect(f.topicAuthority.decide).toHaveBeenCalledOnce();
  });

  it('rejects guests, absent explicit intent, forged Subject and injected visibility before DB access', async () => {
    for (const [action, evidence] of [
      [{ action: 'remember_automatically', originalMessageId: MESSAGE }, undefined],
      [{ action: 'approve_private_learning', originalMessageId: MESSAGE, subjectId: OTHER }, undefined],
      [{ action: 'approve_private_learning', originalMessageId: MESSAGE, visibility: 'character_shared' }, undefined],
      [{ action: 'approve_private_learning', originalMessageId: 'invalid' }, undefined],
      [undefined, { kind: 'guest', verifiedGuestTokenHash: 'hash' }],
    ] as const) {
      const f = fixture();
      await expect(f.submit(action, evidence))
        .rejects.toMatchObject({ code: 'C09_PRIVATE_OPTIN_COMMAND_NOT_AUTHORIZED' });
      expect(f.calls).toEqual([]);
    }
  });

  it('rolls back absent original, invalid topic, failed receipt, capture or current source proof', async () => {
    for (const opts of [
      { missingOriginal: true },
      { badTopic: true },
      { missingReceipt: true },
      { failInsert: true },
      { missingCapture: true },
      { badProof: true },
    ]) {
      const f = fixture(opts);
      await expect(f.submit()).rejects.toBeDefined();
      expect(f.calls.map(x => x.text)).not.toContain('COMMIT');
      expect(f.calls.at(-1)?.text).toBe('ROLLBACK');
      expect(f.releases).toEqual([undefined]);
    }
  });

  it('does not trust the HTTP payload as canonical subject even when another member resolves', async () => {
    const f = fixture({ wrongSubject: true });
    const result = await f.submit();
    expect(result.scope).toBe('user_private');
    expect(f.calls[3]?.values).toEqual([OTHER]);
    expect(f.calls.find(x => x.text === C09_PRIVATE_OPTIN_RECEIPT_SQL_V1)?.values[1])
      .toBe(OTHER);
    expect(f.calls.at(-1)?.text).toBe('COMMIT');
  });
});
