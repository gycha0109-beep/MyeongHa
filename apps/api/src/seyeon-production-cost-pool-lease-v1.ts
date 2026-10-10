import type {
  SeyeonProductionGovernorModeV1,
} from './seyeon-production-governor-boundary-v1.js';
import {
  createSeyeonGovernedPostgresPoolV1,
  type SeyeonGovernedDbConfigV1,
  type SeyeonGovernedPostgresSubjectPoolV1,
} from './seyeon-governed-postgres-pool-v1.js';

export interface SeyeonProductionCostPoolLeaseV1 {
  readonly pool: SeyeonGovernedPostgresSubjectPoolV1;
  close(): Promise<void>;
}

/**
 * D3B2B-3C: cost-only DB authority, never a fallback to an ordinary Pool.
 *
 * OFF has no governed credential requirement, and ENFORCE must have a
 * separately credentialed pool before any paid Provider can be created.
 */
export function createSeyeonProductionCostPoolLeaseV1(input: {
  readonly mode?: SeyeonProductionGovernorModeV1 | undefined;
  readonly governedDbConfig?: SeyeonGovernedDbConfigV1;
  /** Trusted server test seam; not exposed on any HTTP/request body. */
  readonly governedPool?: SeyeonGovernedPostgresSubjectPoolV1;
}): SeyeonProductionCostPoolLeaseV1 | null {
  if (input.mode !== 'ENFORCE') {
    if (input.governedDbConfig !== undefined || input.governedPool !== undefined) {
      throw new Error('OFF refuses an unexpected Governed database connection.');
    }
    return null;
  }

  if (input.governedDbConfig !== undefined && input.governedPool !== undefined) {
    throw new Error('ENFORCE requires exactly one Governed database authority source.');
  }
  if (input.governedPool !== undefined) {
    if (input.governedPool.authority !== 'seyeon-governed-only-v1') {
      throw new Error('ENFORCE refuses a non-Governed cost Pool.');
    }
    return Object.freeze({
      pool: input.governedPool,
      close() { return Promise.resolve(); },
    });
  }
  if (input.governedDbConfig === undefined) {
    throw new Error('ENFORCE requires a separate Governed DB credential before any Provider call.');
  }

  const pool = createSeyeonGovernedPostgresPoolV1(input.governedDbConfig);
  return Object.freeze({
    pool,
    close() { return pool.close(); },
  });
}
