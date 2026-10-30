import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createSeyeonC09IsolatedLearningEventHandlerShadowV1,
} from '../apps/api/src/seyeon-c09-learning-event-isolated-shadow-v1.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const runInIsolation = process.env.C09_ISOLATED_PG_URL ? it : it.skip;

function scope(client: Client, subjectId: string): PostgresSubjectExecutionScopeV1 {
  return {
    client,
    resolvedSubject: { subjectId, subjectKind: 'member' },
  } as unknown as PostgresSubjectExecutionScopeV1;
}

describe('C09 synthetic minimum-role learning events; never production', () => {
  it('rejects executor initialization without isolated DB opt-in', () => {
    const prev = process.env.C09_ISOLATED_PG_URL;
    delete process.env.C09_ISOLATED_PG_URL;
    try {
      expect(() => createSeyeonC09IsolatedLearningEventHandlerShadowV1({
        scope: scope({ query: async () => ({ rows: [] }) } as unknown as Client, A),
      })).toThrowError('C09 learning event execution is not available outside isolated PostgreSQL fixtures.');
    } finally {
      if (prev !== undefined) process.env.C09_ISOLATED_PG_URL = prev;
    }
  });

  runInIsolation('executes approved issue and revoke using only scoped role A, rolling back forged role B', async () => {
    const client = new Client({
      connectionString: process.env.C09_ISOLATED_PG_URL,
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    try {
      await client.query('SET ROLE c09_isolated_subject_b');
      const forged = createSeyeonC09IsolatedLearningEventHandlerShadowV1({
        scope: scope(client, A),
      });
      await expect(forged.process({
        kind: 'issue', sourceRef: 'fixture:event:A',
      })).rejects.toMatchObject({ code: 'C09_EVENT_EXECUTION_NOT_AUTHORIZED' });
      const afterRollback = await client.query('select txid_current()::text as txid');
      expect(afterRollback.rows).toHaveLength(1);
      await client.query('RESET ROLE');

      await client.query('SET ROLE c09_isolated_subject_a');
      const processor = createSeyeonC09IsolatedLearningEventHandlerShadowV1({
        scope: scope(client, A),
      });
      const issue = await processor.process({ kind: 'issue', sourceRef: 'fixture:event:A' });
      expect(issue).toMatchObject({
        kind: 'issue',
        executionScope: 'LOCAL_ISOLATED_POSTGRES_ONLY',
        activatedInProduction: false,
      });
      const before = await client.query(
        'select revoked_at from myeongha_internal.character_learning_evidence_v1 where id=$1::uuid',
        [issue.evidenceId],
      );
      expect(before.rows).toHaveLength(1);
      expect(before.rows[0]?.revoked_at).toBeNull();
      await expect(processor.process({
        kind: 'issue', sourceRef: 'fixture:event:A',
      })).rejects.toMatchObject({ code: 'C09_EVENT_EXECUTION_NOT_AUTHORIZED' });
      const preserved = await client.query(
        'select revoked_at from myeongha_internal.character_learning_evidence_v1 where id=$1::uuid',
        [issue.evidenceId],
      );
      expect(preserved.rows).toHaveLength(1);
      expect(preserved.rows[0]?.revoked_at).toBeNull();
      await client.query('RESET ROLE');

      // Approval ledger issuance is owned by a separate test administrator,
      // not the application executor role; this models the missing production workflow.
      await client.query(
        'insert into myeongha_internal.character_learning_revocation_approvals_v1 ' +
          '(revocation_ref,evidence_id,source_ref,owner_subject_id,state,revision,approved_at) ' +
          'values ($1::text,$2::uuid,$3::text,$4::uuid,\'approved\',1,now())',
        ['fixture:event:revoke:A', issue.evidenceId, 'fixture:event:A', A],
      );
      await client.query('SET ROLE c09_isolated_subject_a');
      const revoke = await processor.process({ kind: 'revoke', evidenceId: issue.evidenceId });
      expect(revoke).toMatchObject({
        kind: 'revoke',
        evidenceId: issue.evidenceId,
        activatedInProduction: false,
      });
      const after = await client.query(
        'select revoked_at from myeongha_internal.character_learning_evidence_v1 where id=$1::uuid',
        [issue.evidenceId],
      );
      expect(after.rows[0]?.revoked_at).not.toBeNull();
      await expect(processor.process({
        kind: 'revoke', evidenceId: issue.evidenceId,
      })).rejects.toMatchObject({ code: 'C09_EVENT_EXECUTION_NOT_AUTHORIZED' });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query('RESET ROLE').catch(() => undefined);
      await client.end();
    }
  });
});
