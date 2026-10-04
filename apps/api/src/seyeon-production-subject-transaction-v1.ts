import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import type {
  ResolvedSubjectContextV1,
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

type Awaitable<T> = T | Promise<T>;

export interface SeyeonProductionSubjectTransactionRunnerV1 {
  resolveSubject(): Promise<ResolvedSubjectContextV1>;
  run<T>(
    expectedSubjectId: string,
    execute: (
      client: PostgresTransactionQueryV1,
      resolvedSubject: ResolvedSubjectContextV1,
    ) => Awaitable<T>,
  ): Promise<T>;
}

function subjectId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
      .test(normalized)
  ) {
    throw new Error(
      'Se-yeon Production transaction runner expected Subject id is invalid.',
    );
  }
  return normalized;
}

export function createSeyeonProductionSubjectTransactionRunnerV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}): SeyeonProductionSubjectTransactionRunnerV1 {
  const run = async <T>(
    expectedSubjectId: string | null,
    execute: (
      client: PostgresTransactionQueryV1,
      resolvedSubject: ResolvedSubjectContextV1,
    ) => Awaitable<T>,
  ): Promise<T> =>
    executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({ client, resolvedSubject }) => {
        if (
          expectedSubjectId !== null &&
          resolvedSubject.subjectId.toLowerCase() !==
            subjectId(expectedSubjectId)
        ) {
          throw new Error(
            'Canonical Subject changed between Se-yeon Production runtime transactions.',
          );
        }
        return execute(client, resolvedSubject);
      },
    });

  return Object.freeze({
    resolveSubject() {
      return run(null, (_client, resolvedSubject) => resolvedSubject);
    },
    run(expectedSubjectId, execute) {
      return run(subjectId(expectedSubjectId), execute);
    },
  });
}
