/**
 * Non-mutating, repository-only V2 connection inventory.
 *
 * This MUST NOT read process.env, network services, GitHub tokens or Production DB.
 * A source contract pass is NOT operational admission, Cloud Run provenance,
 * active Vercel secret binding, end-to-end smoke, or publication authorization.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SAJU_BRIDGE_V2_SOURCE_PATHS = Object.freeze([
  'workers/cloudflare-api-router.mjs',
  'api/me.ts',
  'api/me/saju/calculation.ts',
  'apps/api/src/saju-bridge-existing-authorities-v2.ts',
  'apps/api/src/production-current-subject-saju-calculation-runtime.ts',
  'apps/api/src/production-current-subject-saju-preview-reading-runtime.ts',
  'apps/api/src/production-saju-runtime-config.ts',
  'apps/api/src/production-user-data-runtime-config.ts',
  'apps/api/src/postgres-subject-execution.ts',
  'apps/api/src/current-subject-saju-calculation-http.ts',
  'apps/api/src/current-subject-saju-preview-reading-http.ts',
  'apps/api/src/saju-production-calculation-http-adapter.ts',
  'apps/api/src/saju-production-reading-http-adapter.ts',
]);

export const SAJU_BRIDGE_V2_OPERATIONAL_GAPS = Object.freeze([
  'CURRENT_SAJU_CLOUD_RUN_SERVING_REVISION_NOT_VERIFIED',
  'CURRENT_CLOUDFLARE_ORIGIN_AND_BEARER_BINDING_NOT_VERIFIED',
  'CURRENT_PRODUCTION_SUBJECT_BIRTH_DB_FUNCTIONS_NOT_VERIFIED',
  'CURRENT_AUTHENTICATED_PRODUCT_PREVIEW_E2E_NOT_VERIFIED',
]);

export function loadSajuBridgeV2SourceFiles() {
  return Object.fromEntries(SAJU_BRIDGE_V2_SOURCE_PATHS.map(path => [
    path, readFileSync(new URL('../../' + path, import.meta.url), 'utf8'),
  ]));
}

/** Fail closed on drift across the production entrypoints, without contacting Production. */
export function inspectSajuBridgeV2SourceReadiness(input) {
  const failures = [];
  const files = input ?? {};
  const requireFragments = (path, fragments) => {
    const source = files[path];
    if (typeof source !== 'string') {
      failures.push(path + ':SOURCE_MISSING');
      return;
    }
    for (const [key, fragment] of Object.entries(fragments)) {
      if (!source.includes(fragment)) failures.push(path + ':' + key);
    }
  };
  requireFragments('workers/cloudflare-api-router.mjs', {
    PREVIEW_REWRITE: 'destination: "/api/me?__myeongha_saju_preview_reading=1"',
    CALCULATION_ROUTE: 'id: "api.me.saju.calculation", path: "/api/me/saju/calculation"',
  });
  requireFragments('api/me.ts', {
    PREVIEW_QUERY_MARKER: "SAJU_PREVIEW_READING_PARAM = '__myeongha_saju_preview_reading'",
    PREVIEW_SOURCE_PATH: "SAJU_PREVIEW_READING_ROUTE = '/api/me/saju/preview-reading'",
    PREVIEW_VALUE_GUARD: "sajuPreviewReading !== '1'",
    PREVIEW_DISPATCH: "case 'saju-preview-reading':",
    PREVIEW_RUNTIME: 'createProductionCurrentSubjectSajuPreviewReadingRuntimeV1({',
    SHARED_RESTRICTED_POOL: 'pool: getSharedPostgresPool()',
  });
  requireFragments('api/me/saju/calculation.ts', {
    CALCULATION_ENTRYPOINT: 'createProductionCurrentSubjectSajuCalculationRuntimeV1({',
    CALCULATION_SERVER_ENV: 'env: process.env',
  });
  requireFragments('apps/api/src/production-current-subject-saju-calculation-runtime.ts', {
    CALCULATION_ADAPTER: 'createSajuProductionCalculationHttpAdapterV1({',
    CALCULATION_SERVER_CONFIG: 'parseProductionSajuRuntimeConfigV1(input.env)',
    CALCULATION_RESTRICTED_POOL: 'createProductionPostgresSubjectPoolLeaseV1({',
    CALCULATION_MEMBER_VERIFIER: 'createProductionRequestIdentityVerifierV1({',
  });
  requireFragments('apps/api/src/production-current-subject-saju-preview-reading-runtime.ts', {
    PREVIEW_ADAPTER: 'createSajuPreviewReadingHttpAdapterV1({',
    PREVIEW_SERVER_CONFIG: 'parseProductionSajuRuntimeConfigV1(input.env)',
    PREVIEW_RESTRICTED_POOL: 'createProductionPostgresSubjectPoolLeaseV1({',
    PREVIEW_MEMBER_VERIFIER: 'createProductionRequestIdentityVerifierV1({',
  });
  requireFragments('apps/api/src/saju-bridge-existing-authorities-v2.ts', {
    V2_EXISTING_LOGIN: "databaseLogin: 'myeongha_runtime'",
    V2_EXISTING_ROLE: "databaseExecutionRole: 'myeongha_api_executor'",
    V2_NO_NEW_ROLE: 'newDatabaseRolesRequired: false',
    V2_NO_NEW_SCHEMA: 'newDatabaseSchemaRequired: false',
    V2_NO_NEW_PERMIT: 'newOperatorPermitRequired: false',
    V2_NO_PUBLISH: 'canPublish: false',
    V2_NO_SELL: 'canSell: false',
  });
  requireFragments('apps/api/src/production-saju-runtime-config.ts', {
    HTTPS_ORIGIN_ENV: "serviceOrigin: 'MYEONGHA_SAJU_SERVICE_ORIGIN'",
    BEARER_ENV: "serviceBearer: 'MYEONGHA_SAJU_SERVICE_BEARER'",
    HTTPS_ONLY: "url.protocol !== 'https:'",
    ORIGIN_NO_CREDENTIALS: "url.username !== ''",
  });
  requireFragments('apps/api/src/production-user-data-runtime-config.ts', {
    RESTRICTED_DB_LOGIN_ENV: "databasePrincipal: 'MYEONGHA_DATABASE_PRINCIPAL'",
    MEMBER_AUTH_ENV: "supabaseUrl: 'MYEONGHA_SUPABASE_URL'",
    TLS_PEER_VERIFY: "peerMode !== 'verify-full'",
    NONPRIVILEGED_ROLE: "MYEONGHA_API_EXECUTION_ROLE = 'myeongha_api_executor'",
  });
  requireFragments('apps/api/src/postgres-subject-execution.ts', {
    TRANSACTION_SCOPED_ROLE: 'SET LOCAL ROLE myeongha_api_executor',
    MEMBER_OWNER_QUERY: 'public.begin_member_subject_context_v1($1::uuid)',
    SUBJECT_ASSERT: 'public.assert_myeongha_subject_context_v1($1::uuid)',
  });
  requireFragments('apps/api/src/current-subject-saju-calculation-http.ts', {
    CALCULATION_ROUTE: "route: '/api/me/saju/calculation'",
    CURRENT_SELF_BIRTH: 'public.qry_self_birth_profile_current_v1($1::uuid)',
    CURRENT_BIRTH_REVISION: 'public.qry_birth_profile_current_revision_v1($1::uuid, $2::uuid)',
  });
  requireFragments('apps/api/src/current-subject-saju-preview-reading-http.ts', {
    PREVIEW_ROUTE: "route: '/api/me/saju/preview-reading'",
    PREVIEW_LIFECYCLE: "lifecycle: 'preview'",
    REUSE_CURRENT_BIRTH_AUTHORITY: 'readBoundCurrentBirthProfileV1({',
  });
  requireFragments('apps/api/src/saju-production-calculation-http-adapter.ts', {
    SAJU_CALCULATION_PATH: "SAJU_PRODUCTION_CALCULATION_HTTP_PATH_V1 = '/api/calculations'",
    NO_REDIRECTS: "redirect: 'manual'",
    UPSTREAM_BEARER: 'authorization: `Bearer ${input.bearerToken}`',
  });
  requireFragments('apps/api/src/saju-production-reading-http-adapter.ts', {
    SAJU_PREVIEW_PATH: "SAJU_PREVIEW_READING_HTTP_PATH_V1 = '/api/preview/readings'",
    NO_REDIRECTS: "redirect: 'manual'",
    UPSTREAM_BEARER: 'authorization: `Bearer ${input.bearerToken}`',
    SOURCE_ADMISSION_HEADER: 'x-myeonghwa-product-reading-response-admitted',
  });
  return Object.freeze({
    contract: 'myeongha-saju-bridge-v2-source-readiness-v1',
    sourceContract: failures.length === 0 ? 'SOURCE_WIRING_VERIFIED' : 'SOURCE_CONTRACT_DRIFT',
    failedChecks: Object.freeze(failures),
    sourceFilesChecked: SAJU_BRIDGE_V2_SOURCE_PATHS.length,
    operationalGaps: SAJU_BRIDGE_V2_OPERATIONAL_GAPS,
    operationalEvidence: 'NOT_VERIFIED',
    stagingAdmission: 'HOLD',
    canExecute: false,
    canPublish: false,
    canSell: false,
    // This report never attempts to open a Production connection.
    productionNetworkCalls: 0,
    secretsRead: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = inspectSajuBridgeV2SourceReadiness(loadSajuBridgeV2SourceFiles());
  console.log(JSON.stringify(report, null, 2));
  if (report.sourceContract !== 'SOURCE_WIRING_VERIFIED') process.exitCode = 1;
}
