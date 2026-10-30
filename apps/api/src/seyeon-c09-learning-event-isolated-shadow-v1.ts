import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import {
  createSeyeonC09LearningPublicationPlannerShadowV1,
  SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1,
  SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1,
} from './seyeon-c09-learning-evidence-publication-shadow-v1.js';
import {
  createPostgresSeyeonC09PublicationSourceShadowV1,
} from './postgres-seyeon-c09-publication-source-shadow-v1.js';

export const SEYEON_C09_ISOLATED_LEARNING_EVENT_SHADOW_VERSION_V1 =
  'seyeon-c09-isolated-learning-event-shadow-v1' as const;

export class SeyeonC09IsolatedEventHoldV1 extends Error {
  readonly code = 'C09_EVENT_EXECUTION_NOT_AUTHORIZED' as const;
  constructor() {
    super('C09 learning event execution is not available outside isolated PostgreSQL fixtures.');
    this.name = 'SeyeonC09IsolatedEventHoldV1';
  }
}

const TEST_SUBJECT_ROLES: Readonly<Record<string, string>> = Object.freeze({
  c09_isolated_subject_a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  c09_isolated_subject_b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
});
const hold = (): never => { throw new SeyeonC09IsolatedEventHoldV1(); };

export type SeyeonC09IsolatedLearningEventV1 =
  | Readonly<{ kind: 'issue'; sourceRef: string }>
  | Readonly<{ kind: 'revoke'; evidenceId: string }>;

export interface SeyeonC09IsolatedLearningEventResultV1 {
  readonly version: typeof SEYEON_C09_ISOLATED_LEARNING_EVENT_SHADOW_VERSION_V1;
  readonly executionScope: 'LOCAL_ISOLATED_POSTGRES_ONLY';
  readonly kind: SeyeonC09IsolatedLearningEventV1['kind'];
  readonly evidenceId: string;
  readonly activatedInProduction: false;
}

/**
 * Executable only in the disposable PG17 fixture; deliberately incompatible
 * with real myeongha_api_executor and real DB names/Subject identities.
 * NOT a production event handler, grant, migration, or authorization bypass.
 */
export function createSeyeonC09IsolatedLearningEventHandlerShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>) {
  const scope = input?.scope;
  const subjectId = scope?.resolvedSubject?.subjectId;
  const client = scope?.client;
  const isolatedUrl = process.env.C09_ISOLATED_PG_URL;
  if (!client || typeof client.query !== 'function' ||
      !subjectId || !Object.values(TEST_SUBJECT_ROLES).includes(subjectId) ||
      !isolatedUrl) hold();

  return Object.freeze({
    async process(event: SeyeonC09IsolatedLearningEventV1):
      Promise<SeyeonC09IsolatedLearningEventResultV1> {
      if (!event || !['issue', 'revoke'].includes(event.kind)) hold();
      let began = false;
      try {
        await client.query('BEGIN');
        began = true;
        const role = await client.query<{
          role: string;
          db: string;
        }>('select current_user as "role", current_database() as db');
        if (role.rows.length !== 1 ||
            role.rows[0]?.db !== 'fixture' ||
            TEST_SUBJECT_ROLES[role.rows[0]?.role ?? ''] !== subjectId ||
            !isolatedUrl!.includes('/fixture')) hold();

        const authority = createPostgresSeyeonC09PublicationSourceShadowV1({ scope });
        const planner = createSeyeonC09LearningPublicationPlannerShadowV1({
          subjectId,
          sourceAuthority: authority,
        });
        const plan = event.kind === 'issue'
          ? await planner.prepareIssue({
              subjectId,
              sourceRef: event.sourceRef,
            })
          : await planner.prepareRevoke({
              subjectId,
              evidenceId: event.evidenceId,
            });
        if (plan.mayExecuteInProduction !== false ||
            plan.scope !== 'PROPOSAL_SQL_ONLY_NO_EXECUTION' ||
            plan.sql !== (event.kind === 'issue'
              ? SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1
              : SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1)) hold();
        const result = await client.query<{ evidenceId: string }>(
          plan.sql,
          plan.parameters,
        );
        if (result.rows.length !== 1 ||
            typeof result.rows[0]?.evidenceId !== 'string' ||
            (event.kind === 'issue' && result.rows[0]?.evidenceId !== plan.parameters[0]) ||
            (event.kind === 'revoke' && result.rows[0]?.evidenceId !== event.evidenceId)) hold();
        await client.query('COMMIT');
        began = false;
        return Object.freeze({
          version: SEYEON_C09_ISOLATED_LEARNING_EVENT_SHADOW_VERSION_V1,
          executionScope: 'LOCAL_ISOLATED_POSTGRES_ONLY' as const,
          kind: event.kind,
          evidenceId: result.rows[0]!.evidenceId,
          activatedInProduction: false as const,
        });
      } catch {
        if (began) {
          try { await client.query('ROLLBACK'); } catch { /* disposable test connection only */ }
        }
        return hold();
      }
    },
  });
}
