import { describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  createPostgresSeyeonC09PublicationSourceShadowV1,
} from '../apps/api/src/postgres-seyeon-c09-publication-source-shadow-v1.js';
import {
  createSeyeonC09LearningPublicationPlannerShadowV1,
} from '../apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOURCE = 'fixture:share:integration';
const CONSENT = 'fixture:consent:integration';
const runOnlyInIsolatedPg = process.env.C09_ISOLATED_PG_URL ? it : it.skip;

describe('C09 opt-in LIVE isolated Postgres17 atomic issue/revoke', () => {
  runOnlyInIsolatedPg('reads real source rows then issues and revokes through locked SQL functions', async () => {
    const client = new Client({
      connectionString: process.env.C09_ISOLATED_PG_URL,
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    try {
      const scope = {
        resolvedSubject: { subjectId: A, subjectKind: 'member' },
        client,
      } as unknown as PostgresSubjectExecutionScopeV1;
      const source = createPostgresSeyeonC09PublicationSourceShadowV1({ scope });
      const planner = createSeyeonC09LearningPublicationPlannerShadowV1({
        subjectId: A, sourceAuthority: source,
      });
      const issue = await planner.prepareIssue({ subjectId: A, sourceRef: SOURCE });
      expect(issue.parameters).toHaveLength(6);
      expect(issue.parameters.slice(1)).toEqual([
        A, SOURCE, 'fixture:approval:integration', CONSENT, '1',
      ]);

      await client.query('begin');
      const issued = await client.query(issue.sql, [...issue.parameters]);
      await client.query('commit');
      const evidenceId = issued.rows[0]?.evidenceId as string;
      expect(evidenceId).toBe(issue.parameters[0]);
      const before = await client.query(
        'select revoked_at from myeongha_internal.character_learning_evidence_v1 where id=$1::uuid',
        [evidenceId],
      );
      expect(before.rows).toHaveLength(1);
      expect(before.rows[0]?.revoked_at).toBeNull();

      await client.query(
        'insert into myeongha_internal.character_learning_revocation_approvals_v1 ' +
          '(revocation_ref,evidence_id,source_ref,owner_subject_id,state,revision,approved_at) ' +
          'values ($1::text,$2::uuid,$3::text,$4::uuid,\'approved\',1,now())',
        ['fixture:revoke:integration', evidenceId, SOURCE, A],
      );
      const revoke = await planner.prepareRevoke({ subjectId: A, evidenceId });
      expect(revoke.parameters).toEqual([
        A, evidenceId, 'fixture:revoke:integration', '1',
      ]);
      await client.query('begin');
      const revoked = await client.query(revoke.sql, [...revoke.parameters]);
      await client.query('commit');
      expect(revoked.rows[0]?.evidenceId).toBe(evidenceId);
      const after = await client.query(
        'select revoked_at from myeongha_internal.character_learning_evidence_v1 where id=$1::uuid',
        [evidenceId],
      );
      expect(after.rows[0]?.revoked_at).not.toBeNull();

      await client.query(
        'select myeongha_internal.c09_revoke_sharing_consent_shadow_v1($1::uuid,$2::text,$3::text,$4::bigint)',
        [A, SOURCE, CONSENT, 1],
      );
      const consent = await source.readCurrentSharingConsent({
        subjectId: A, sourceRef: SOURCE, sharingConsentRef: CONSENT, topicKey: 'python.programming',
      }) as { status: string; revision: number };
      expect(consent).toMatchObject({ status: 'revoked', revision: 2 });
      await expect(planner.prepareIssue({ subjectId: A, sourceRef: SOURCE }))
        .rejects.toBeDefined();
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});
