import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresSeyeonC09ApprovedLearningAuthorityShadowV1,
  createPostgresSeyeonC09LearningLedgerReaderShadowV1,
  POSTGRES_SEYEON_C09_KNOWLEDGE_TOPIC_SQL_V1,
  POSTGRES_SEYEON_C09_LEARNING_HISTORY_SQL_V1,
  POSTGRES_SEYEON_C09_LEARNING_VERIFY_SQL_V1,
} from '../apps/api/src/postgres-seyeon-c09-learning-ledger-shadow-v1.js';
import {
  createSeyeonC09EpistemicAuthorityShadowPortV1,
  type SeyeonC09ApprovedLearningReadAuthorityV1,
} from '../apps/api/src/seyeon-c09-epistemic-authority-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const SUBJECT_B = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';
const AS_OF = '2026-10-29T07:00:00.000Z';
const LEARNED_AT = '2026-10-28T06:00:00.000Z';

function topic() {
  return {
    characterId: 'seyeon',
    topicKey: 'python.programming',
    policyVersion: 'source-canon-v1',
    authoritySourceRef: 'canon:approved-topic:1',
    domainPolicy: 'bounded',
    baseline: 'explicit_unaware',
  };
}
function history(
  patch: Record<string, unknown> = {},
) {
  return {
    evidenceId: EVIDENCE_ID,
    characterId: 'seyeon',
    topicKey: 'python.programming',
    sourceKind: 'user_taught_verified',
    authorityRef: 'approved:deidentified-lesson:1',
    awareness: 'heard_of',
    visibility: 'character_shared',
    subjectId: null,
    approvedForCharacterSharing: true,
    privacyReviewed: true,
    learnedAt: LEARNED_AT,
    validAt: LEARNED_AT,
    verifiedAt: LEARNED_AT,
    supersededAt: null,
    approvalRef: 'approved:owner:1',
    privacyReviewRef: 'review:privacy:1',
    ...patch,
  };
}
function verification(
  patch: Record<string, unknown> = {},
) {
  const row = history();
  return {
    evidenceId: row.evidenceId,
    authorityRef: row.authorityRef,
    characterId: row.characterId,
    topicKey: row.topicKey,
    visibility: row.visibility,
    sourceSubjectId: row.subjectId,
    approvedForCharacterSharing: row.approvedForCharacterSharing,
    privacyReviewed: row.privacyReviewed,
    approvalRef: row.approvalRef,
    privacyReviewRef: row.privacyReviewRef,
    verifiedAt: row.verifiedAt,
    validAt: row.validAt,
    learnedAt: row.learnedAt,
    supersededAt: row.supersededAt,
    revokedAt: null,
    ...patch,
  };
}

function fake(options: {
  policyRows?: readonly Record<string, unknown>[];
  historyRows?: readonly Record<string, unknown>[];
  verificationRows?: readonly Record<string, unknown>[];
  onVerify?: () => void;
  unavailable?: boolean;
} = {}) {
  const query = vi.fn(async (sql: string, args?: readonly unknown[]) => {
    if (options.unavailable) throw new Error('permission denied for schema myeongha_internal');
    if (sql === POSTGRES_SEYEON_C09_KNOWLEDGE_TOPIC_SQL_V1) {
      expect(args).toEqual(['seyeon', 'python.programming']);
      return { rows: options.policyRows ?? [topic()] };
    }
    if (sql === POSTGRES_SEYEON_C09_LEARNING_HISTORY_SQL_V1) {
      expect(args).toEqual(['seyeon', 'python.programming', SUBJECT, AS_OF]);
      return { rows: options.historyRows ?? [history()] };
    }
    if (sql === POSTGRES_SEYEON_C09_LEARNING_VERIFY_SQL_V1) {
      expect(args).toEqual([EVIDENCE_ID, 'seyeon', 'python.programming', history().authorityRef]);
      options.onVerify?.();
      return { rows: options.verificationRows ?? [verification()] };
    }
    throw new Error('SQL not expected');
  });
  const scope = {
    client: { query },
    resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const reader = createPostgresSeyeonC09LearningLedgerReaderShadowV1({ scope });
  return { query, reader };
}

describe('C09 proposed learning ledger real SQL source reader (mocked schema)', () => {
  it('reads approved Canon topic and de-identified shared lesson and re-verifies original source', async () => {
    const { reader, query } = fake();
    expect(await reader.readAuthoritativeTopicPolicy({
      characterId: 'seyeon', topicKey: 'python.programming',
    })).toEqual(topic());
    const records = await reader.readVerifiedLearningHistory({
      characterId: 'seyeon', topicKey: 'python.programming',
      subjectId: SUBJECT, asOfTurn: AS_OF,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      characterId: 'seyeon', sourceKind: 'user_taught_verified',
      awareness: 'heard_of', visibility: 'character_shared',
      subjectId: null, verifiedByServer: true,
    });
    expect(JSON.stringify(records)).not.toContain('review:privacy:1');
    expect(await reader.verifyLearningEvidence({
      characterId: 'seyeon', evidenceId: EVIDENCE_ID,
      authorityRef: history().authorityRef,
      subjectId: SUBJECT, topicKey: 'python.programming', asOfTurn: AS_OF,
    })).toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('plugs actual SQL adapter into C09 epistemic resolver with server classified turn', async () => {
    const { reader, query } = fake();
    const authority: SeyeonC09ApprovedLearningReadAuthorityV1 = {
      readServerClassifiedTurn: async ({ subjectId, currentUserMessageId }) => ({
        subjectId, currentUserMessageId,
        topicKey: 'python.programming', requestKind: 'technical_execution',
        asOfTurn: AS_OF,
      }),
      ...reader,
    };
    const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
      subjectId: SUBJECT, authority,
    });
    const d = await port.readCurrentKnowledgeDecision({
      subjectId: SUBJECT, currentUserMessageId: 'user-1',
    }) as { characterKnowledgeLevel: string; responsePermission: string };
    expect(d.characterKnowledgeLevel).toBe('heard_of');
    expect(d.responsePermission).toBe('withhold');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('private lesson is visible only to its canonical Subject, never a different Subject', async () => {
    const privateRow = history({
      visibility: 'user_private', subjectId: SUBJECT,
      approvedForCharacterSharing: false,
      privacyReviewed: false, privacyReviewRef: null,
    });
    const { reader } = fake({
      historyRows: [privateRow],
      verificationRows: [verification({
        visibility: 'user_private', sourceSubjectId: SUBJECT,
        approvedForCharacterSharing: false,
        privacyReviewed: false, privacyReviewRef: null,
      })],
    });
    const records = await reader.readVerifiedLearningHistory({
      characterId: 'seyeon', topicKey: 'python.programming',
      subjectId: SUBJECT, asOfTurn: AS_OF,
    });
    expect(records[0]?.visibility).toBe('user_private');
    expect(records[0]?.subjectId).toBe(SUBJECT);
    await expect(reader.readVerifiedLearningHistory({
      characterId: 'seyeon', topicKey: 'python.programming',
      subjectId: SUBJECT_B, asOfTurn: AS_OF,
    })).rejects.toMatchObject({ code: 'C09_LEARNING_LEDGER_UNAVAILABLE' });
  });

  it('blocks a shared record with missing sharing review or approval', async () => {
    for (const invalid of [
      history({ privacyReviewed: false }),
      history({ privacyReviewRef: null }),
      history({ approvedForCharacterSharing: false }),
      history({ subjectId: SUBJECT }),
      history({ verifiedAt: '2026-10-30T00:00:00.000Z' }),
      history({ supersededAt: '2026-10-29T00:00:00.000Z' }),
    ]) {
      const { reader } = fake({ historyRows: [invalid] });
      await expect(reader.readVerifiedLearningHistory({
        characterId: 'seyeon', topicKey: 'python.programming',
        subjectId: SUBJECT, asOfTurn: AS_OF,
      })).rejects.toMatchObject({ code: 'C09_LEARNING_LEDGER_UNAVAILABLE' });
    }
  });

  it('blocks revoked, cross-subject, unapproved or unverified data on independent source re-read', async () => {
    const changed = [
      verification({ revokedAt: '2026-10-29T06:50:00.000Z' }),
      verification({ approvalRef: null }),
      verification({ sourceSubjectId: SUBJECT }),
      verification({ privacyReviewed: false }),
      verification({ privacyReviewRef: null }),
    ];
    for (const v of changed) {
      const { reader } = fake({ verificationRows: [v] });
      expect(await reader.verifyLearningEvidence({
        characterId: 'seyeon', evidenceId: EVIDENCE_ID,
        authorityRef: history().authorityRef,
        subjectId: SUBJECT, topicKey: 'python.programming', asOfTurn: AS_OF,
      })).toBe(false);
    }
  });

  it('fails closed on missing schema or SQL permissions, no fallback to client-provided evidence', async () => {
    const { reader } = fake({ unavailable: true });
    await expect(reader.readAuthoritativeTopicPolicy({
      characterId: 'seyeon', topicKey: 'python.programming',
    })).rejects.toMatchObject({ code: 'C09_LEARNING_LEDGER_UNAVAILABLE' });
    await expect(reader.readVerifiedLearningHistory({
      characterId: 'seyeon', topicKey: 'python.programming',
      subjectId: SUBJECT, asOfTurn: AS_OF,
    })).rejects.toMatchObject({ code: 'C09_LEARNING_LEDGER_UNAVAILABLE' });
  });

  it('rejects unauthorized empty records and oversized result sets rather than silently truncating', async () => {
    const { reader } = fake({ historyRows: Array.from({ length: 65 }, (_, i) => history({ evidenceId: EVIDENCE_ID.replace(/.$/, String(i % 10)) })) });
    await expect(reader.readVerifiedLearningHistory({
      characterId: 'seyeon', topicKey: 'python.programming',
      subjectId: SUBJECT, asOfTurn: AS_OF,
    })).rejects.toMatchObject({ code: 'C09_LEARNING_LEDGER_UNAVAILABLE' });
  });
});


describe('C09 opt-in server-classified turn + PostgreSQL learning reader composition', () => {
  it('joins the server-owned topic classification with independent ledger reads', async () => {
    const { reader, query } = fake();
    const scope = {
      resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
      client: { query },
    } as unknown as PostgresSubjectExecutionScopeV1;
    const authority = createPostgresSeyeonC09ApprovedLearningAuthorityShadowV1({
      scope,
      readServerClassifiedTurn: async ({ subjectId, currentUserMessageId }) => ({
        subjectId,
        currentUserMessageId,
        topicKey: 'python.programming',
        requestKind: 'technical_execution',
        asOfTurn: AS_OF,
      }),
    });
    const port = createSeyeonC09EpistemicAuthorityShadowPortV1({
      subjectId: SUBJECT,
      authority,
    });
    const result = await port.readCurrentKnowledgeDecision({
      subjectId: SUBJECT,
      currentUserMessageId: 'current-user-message',
    }) as { characterKnowledgeLevel: string };
    expect(result.characterKnowledgeLevel).toBe('heard_of');
    expect(query).toHaveBeenCalledTimes(3);
    expect(reader).toBeDefined();
  });

  it('rejects a classifier that rebinds the Subject', async () => {
    const { query } = fake();
    const scope = {
      resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
      client: { query },
    } as unknown as PostgresSubjectExecutionScopeV1;
    const authority = createPostgresSeyeonC09ApprovedLearningAuthorityShadowV1({
      scope,
      readServerClassifiedTurn: async ({ currentUserMessageId }) => ({
        subjectId: SUBJECT_B,
        currentUserMessageId,
        topicKey: 'python.programming',
        requestKind: 'technical_execution',
        asOfTurn: AS_OF,
      }),
    });
    await expect(authority.readServerClassifiedTurn({
      subjectId: SUBJECT,
      currentUserMessageId: 'current-message',
    })).rejects.toMatchObject({
      code: 'C09_LEARNING_LEDGER_UNAVAILABLE',
    });
    expect(query).not.toHaveBeenCalled();
  });
});
