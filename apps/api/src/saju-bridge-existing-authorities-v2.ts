import {
  CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1,
} from './current-subject-saju-calculation-http.js';
import {
  CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1,
} from './current-subject-saju-preview-reading-http.js';
import {
  createProductionCurrentSubjectSajuCalculationRuntimeV1,
  type ProductionCurrentSubjectSajuCalculationRuntimeV1,
} from './production-current-subject-saju-calculation-runtime.js';
import {
  createProductionCurrentSubjectSajuPreviewReadingRuntimeV1,
  type ProductionCurrentSubjectSajuPreviewReadingRuntimeV1,
} from './production-current-subject-saju-preview-reading-runtime.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import {
  parseProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';
import type { ProductionSajuRuntimeEnvV1 } from './production-saju-runtime-config.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SajuProductionCalculationHttpFetchV1 } from './saju-production-calculation-http-adapter.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

/**
 * V2: member-facing Saju integration composes existing trusted authorities.
 * NO new database roles, schemas, LOGIN credentials, operator permits,
 * deployment migration, Owner-approval issuer or privileged DB session.
 * This is a server-only composition; it does NOT mount a public preview route,
 * grant launch/rehearsal approval, or replace isolated staging R01-R14.
 */
export const SAJU_BRIDGE_EXISTING_AUTHORITIES_V2 = Object.freeze({
  contract: 'myeongha-saju-bridge-existing-authorities-v2',
  databaseLogin: 'myeongha_runtime',
  databaseExecutionRole: 'myeongha_api_executor',
  calculationRoute: CURRENT_SUBJECT_SAJU_CALCULATION_HTTP_BINDINGS_V1.route,
  previewOnlyRoute: CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1.route,
  newDatabaseRolesRequired: false,
  newDatabaseSchemaRequired: false,
  newOperatorPermitRequired: false,
  canRunOnce: false,
  canExecute: false,
  canPublish: false,
  canSell: false,
} as const);

export interface SajuBridgeExistingAuthoritiesRequestV2 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface SajuBridgeExistingAuthoritiesRuntimeV2 {
  handleRequest(input: SajuBridgeExistingAuthoritiesRequestV2): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateSajuBridgeExistingAuthoritiesInputV2 {
  readonly env: ProductionSajuRuntimeEnvV1;
  /**
   * Existing restricted Subject DB pool. Never the postgres migration pool,
   * service_role pool, or dormant S3A operator-permit pool.
   */
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly sajuFetchImpl?: SajuProductionCalculationHttpFetchV1;
  readonly now?: () => number;
}

/**
 * No SQL DDL or role provisioning. Both pre-existing Saju handlers share
 * one restricted subject pool; all Auth/current Birth/HTTPS response checks
 * remain in their existing production handlers.
 *
 * The preview path is composed but NOT mounted on a public entry point.
 * General paid Reading, entitlement and release activation are out of scope.
 */
export function createSajuBridgeExistingAuthoritiesV2(
  input: CreateSajuBridgeExistingAuthoritiesInputV2,
): SajuBridgeExistingAuthoritiesRuntimeV2 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const lease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const shared = {
    env: input.env,
    pool: lease.pool,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
    ...(input.sajuFetchImpl === undefined ? {} : { sajuFetchImpl: input.sajuFetchImpl }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  let calculation: ProductionCurrentSubjectSajuCalculationRuntimeV1;
  let preview: ProductionCurrentSubjectSajuPreviewReadingRuntimeV1;
  try {
    calculation = createProductionCurrentSubjectSajuCalculationRuntimeV1(shared);
    preview = createProductionCurrentSubjectSajuPreviewReadingRuntimeV1(shared);
  } catch (error) {
    void lease.close();
    throw error;
  }

  let closed = false;
  return Object.freeze({
    async handleRequest(requestInput: SajuBridgeExistingAuthoritiesRequestV2) {
      if (closed) return new Response(null, { status: 503 });
      // Dispatch only exact known routes. No permit/issuance or generic
      // reading/commerce endpoint is reachable via this composition.
      let url: URL;
      try {
        url = new URL(requestInput.request.url);
      } catch {
        return new Response(null, { status: 404 });
      }
      if (url.search !== '' || url.hash !== '') return new Response(null, { status: 404 });
      if (url.pathname === SAJU_BRIDGE_EXISTING_AUTHORITIES_V2.calculationRoute) {
        return calculation.handleRequest(requestInput);
      }
      if (url.pathname === SAJU_BRIDGE_EXISTING_AUTHORITIES_V2.previewOnlyRoute) {
        return preview.handleRequest(requestInput);
      }
      return new Response(null, { status: 404 });
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([calculation.close(), preview.close()]);
      await lease.close();
    },
  });
}
