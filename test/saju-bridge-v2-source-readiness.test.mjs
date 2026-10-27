import { describe, expect, it } from 'vitest';
import {
  SAJU_BRIDGE_V2_SOURCE_PATHS,
  inspectSajuBridgeV2SourceReadiness,
  loadSajuBridgeV2SourceFiles,
} from '../scripts/operations/inspect-saju-bridge-v2-source-readiness.mjs';

describe('Saju bridge V2 non-mutating source and release evidence separation', () => {
  it('confirms only the checked-in wiring and always keeps Production evidence unverified', () => {
    const source = loadSajuBridgeV2SourceFiles();
    const report = inspectSajuBridgeV2SourceReadiness(source);
    expect(Object.keys(source).sort()).toEqual([...SAJU_BRIDGE_V2_SOURCE_PATHS].sort());
    expect(report).toMatchObject({
      sourceContract: 'SOURCE_WIRING_VERIFIED',
      failedChecks: [],
      sourceFilesChecked: SAJU_BRIDGE_V2_SOURCE_PATHS.length,
      operationalEvidence: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      canExecute: false,
      canPublish: false,
      canSell: false,
      productionNetworkCalls: 0,
      secretsRead: false,
    });
    expect(report.operationalGaps).toContain('CURRENT_CLOUDFLARE_ORIGIN_AND_BEARER_BINDING_NOT_VERIFIED');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('MYEONGHA_DATABASE_URL=');
    expect(serialized).not.toContain('MYEONGHA_SAJU_SERVICE_BEARER=');
    expect(serialized).not.toContain('BEGIN CERTIFICATE');
  });

  it.each([
    [
      'workers/cloudflare-api-router.mjs',
      (source) => source.replace(
        '/api/me?__myeongha_saju_preview_reading=1',
        '/api/me?__myeongha_saju_preview_reading=0',
      ),
      'PREVIEW_REWRITE',
    ],
    [
      'api/me.ts',
      (source) => source.replace(
        "SAJU_PREVIEW_READING_PARAM = '__myeongha_saju_preview_reading'",
        "SAJU_PREVIEW_READING_PARAM = '__stale_preview_flag'",
      ),
      'PREVIEW_QUERY_MARKER',
    ],
    [
      'api/me/saju/calculation.ts',
      (source) => source.replace(
        'createProductionCurrentSubjectSajuCalculationRuntimeV1({',
        'createUnverifiedCalculationRuntime({',
      ),
      'CALCULATION_ENTRYPOINT',
    ],
    [
      'apps/api/src/production-saju-runtime-config.ts',
      (source) => source.replace(
        "url.protocol !== 'https:'",
        "url.protocol !== 'http:'",
      ),
      'HTTPS_ONLY',
    ],
    [
      'apps/api/src/postgres-subject-execution.ts',
      (source) => source.replace(
        'SET LOCAL ROLE myeongha_api_executor',
        'SET LOCAL ROLE service_role',
      ),
      'TRANSACTION_SCOPED_ROLE',
    ],
    [
      'apps/api/src/saju-bridge-existing-authorities-v2.ts',
      (source) => source.replace(
        'newDatabaseRolesRequired: false',
        'newDatabaseRolesRequired: true',
      ),
      'V2_NO_NEW_ROLE',
    ],
    [
      'apps/api/src/saju-production-reading-http-adapter.ts',
      (source) => source.replace(
        'x-myeonghwa-product-reading-response-admitted',
        'x-untrusted-reading',
      ),
      'SOURCE_ADMISSION_HEADER',
    ],
  ])('detects static %s drift without accepting it as a deployment fact', (path, change, code) => {
    const sources = loadSajuBridgeV2SourceFiles();
    const mutated = change(sources[path]);
    expect(mutated).not.toBe(sources[path]);
    const report = inspectSajuBridgeV2SourceReadiness({ ...sources, [path]: mutated });
    expect(report.sourceContract).toBe('SOURCE_CONTRACT_DRIFT');
    expect(report.failedChecks).toContain(path + ':' + code);
    expect(report.operationalEvidence).toBe('NOT_VERIFIED');
    expect(report.canPublish).toBe(false);
    expect(report.canSell).toBe(false);
  });

  it('reports absent and malformed route sources as drift, not successful preflight', () => {
    const sources = loadSajuBridgeV2SourceFiles();
    const absent = inspectSajuBridgeV2SourceReadiness({
      ...sources,
      'apps/api/src/current-subject-saju-calculation-http.ts': undefined,
    });
    expect(absent.failedChecks).toContain(
      'apps/api/src/current-subject-saju-calculation-http.ts:SOURCE_MISSING',
    );
    const broken = inspectSajuBridgeV2SourceReadiness({
      ...sources,
      'workers/cloudflare-api-router.mjs': '{',
    });
    expect(broken.failedChecks).toContain('workers/cloudflare-api-router.mjs:PREVIEW_REWRITE');
    expect(broken.operationalGaps).toHaveLength(4);
    expect(broken.stagingAdmission).toBe('HOLD');
  });
});
