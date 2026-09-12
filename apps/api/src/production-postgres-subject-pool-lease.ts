import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';

export interface ProductionPostgresSubjectPoolLeaseV1 {
  readonly pool: PostgresSubjectPoolV1;
  close(): Promise<void>;
}

export function createProductionPostgresSubjectPoolLeaseV1(input: {
  readonly config: ProductionUserDataRuntimeConfigV1;
  readonly pool?: PostgresSubjectPoolV1;
}): ProductionPostgresSubjectPoolLeaseV1 {
  if (input.pool !== undefined) {
    return Object.freeze({
      pool: input.pool,
      close() {
        return Promise.resolve();
      },
    });
  }

  const ownedPool = createNodePostgresSubjectPoolV1(input.config);
  return Object.freeze({
    pool: ownedPool,
    close() {
      return ownedPool.close();
    },
  });
}
