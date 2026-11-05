import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED = {
  sha256:'b582350aa1d839d1ae5b7813b930dc43c3859a4c30dda323078dd2f311f9bb6e',
  main:'b536a7e232f9f7810c0ba5c02e906789c706c369',
};
const requireProof = (pass, message) => {
  if (!pass) throw Error('ISOLATED_PG18_PROOF_INVALID: ' + message);
};
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const flagsFalse = (obj, keys) => keys.forEach(k =>
  requireProof(obj[k] === false, 'unapproved acceptance claim '+k));
const unsafe = ['productionCapacityProven','drReady','serviceResumptionAllowed','outputContainsIdentifiers'];
export function verifyIsolatedPg18LinuxProof(bytes, mainSha) {
  requireProof(Buffer.isBuffer(bytes) && bytes.length === 3747, 'original evidence byte size');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  requireProof(sha256 === EXPECTED.sha256 && mainSha === EXPECTED.main,
    'unaltered evidence checksum and original main commit required');
  const p = JSON.parse(bytes.toString('utf8'));
  requireProof(p.schema === 'myeongha-ops-isolated-pg18-phase7-phase11-v1'
    && p.scope === 'temporary-github-runner-local-postgres18'
    && p.status === 'PASS' && p.realIsolatedRlsProven === true
    && p.isolatedRlsCaseCount === 1 && p.isolatedPoolSaturationProven === true
    && p.productionRlsProven === false && p.sajuResourceCeilingProven === false,
  'actual isolated RLS and pool proof only');
  flagsFalse(p,[...unsafe,'scalingThresholdApproved']);
  const cap = p.syntheticCapacityMeasurements;
  requireProof(cap.schema === 'myeongha-isolated-postgres-capacity-phase11-v1'
    && cap.result === 'PASS' && cap.dataPrivacy === 'synthetic_sql_only'
    && cap.poolMax === 2 && cap.totalRequested === 96
    && cap.queryDelayMs === 80 && cap.acquireTimeoutMs === 140
    && cap.postSaturationRecovery === true,
  'pool fixture and recovery');
  flagsFalse(cap,['realMyeonghaQueriesMeasured','productionCapacityProven','scalingThresholdApproved']);
  requireProof(Array.isArray(cap.observations) && cap.observations.length === 4,
    'four recorded pool stages');
  let samples = 0;
  for(let i=0;i<4;i++) {
    const s=cap.observations[i];
    requireProof(s.concurrency === [1,2,4,8][i]
      && Number.isSafeInteger(s.samples) && Number.isSafeInteger(s.completed)
      && Number.isSafeInteger(s.acquireTimeouts)
      && s.completed >= 0 && s.acquireTimeouts >= 0
      && s.completed+s.acquireTimeouts === s.samples
      && s.observedPeakConnections >= 1 && s.observedPeakConnections <= 2
      && [s.successfulP50Ms,s.successfulP95Ms,s.successfulP99Ms].every(finite)
      && s.successfulP50Ms <= s.successfulP95Ms
      && s.successfulP95Ms <= s.successfulP99Ms,
    'pool stage counts or quantiles');
    samples += s.samples;
  }
  requireProof(samples === 96
    && cap.observations[0].acquireTimeouts === 0
    && cap.observations[1].acquireTimeouts === 0
    && cap.observations[3].completed === 16
    && cap.observations[3].acquireTimeouts === 16, 'measured pool pressure');
  const x=p.isolatedProductPath, b=x.baseline,c=x.contended;
  requireProof(x.schema === 'myeongha-isolated-pg18-product-path-phase10-phase11-v1'
    && x.result === 'PASS' && x.databaseTransport === 'actual_ephemeral_postgres18_rls'
    && x.sajuEngineTransport === 'synthetic_response_not_real_engine'
    && x.actualAuthHttp === true && x.actualSajuHttp === true
    && x.dbPeak === 2 && x.dbBudget === 2
    && [x.dbAcquireP95Ms,x.dbQueryP95Ms].every(finite)
    && x.sajuTimeoutUnavailable === 1 && x.authUnavailable === 1
    && x.dbUnavailable === 1 && x.healthUnaffected === true,
  'real isolated DB and synthetic Saju product path');
  flagsFalse(x,[...unsafe,'productionScalingThresholdApproved']);
  requireProof(b.requested === 12 && b.concurrency === 1
    && b.successful === 12 && b.unavailable === 0 && b.unexpected === 0,
  'baseline request accounting');
  requireProof(c.requested === 32 && c.concurrency === 8
    && c.successful === 16 && c.unavailable === 16 && c.unexpected === 0,
  'contended request accounting');
  for(const s of [b,c]) requireProof([s.p50Ms,s.p95Ms,s.p99Ms].every(finite)
    && s.p50Ms <= s.p95Ms && s.p95Ms <= s.p99Ms, 'product quantiles');
  requireProof(x.authHttpRequests === 47 && x.sajuHttpRequests === 29
    && x.dbAcquisitionAttempts === 45,'HTTP/DB request count integrity');
  return {sha256,mainSha,status:'VALIDATED_ISOLATED_ONLY', rlsCases:1,
    poolRequested:96,poolMax:2,capacity8Completed:16,capacity8Timeouts:16,
    baselineSuccessful:12,baselineP95Ms:b.p95Ms,contendedSuccessful:16,
    contendedUnavailable:16,contendedP95Ms:c.p95Ms,
    dbAcquireP95Ms:x.dbAcquireP95Ms,dbQueryP95Ms:x.dbQueryP95Ms,
    productionCapacityProven:false,drReady:false};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [path, sha] = process.argv.slice(2);
    requireProof(Boolean(path && sha), 'expected <proof.json> <original-main-sha>');
    console.log(JSON.stringify(verifyIsolatedPg18LinuxProof(readFileSync(path),sha),null,2));
  } catch {
    console.error('ISOLATED_PG18_PROOF_BLOCKED: original GitHub Linux observation not verified');
    process.exitCode=1;
  }
}
