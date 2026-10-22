// Read-only acceptance of BOTH sanitized Stage 9 Preview CI records.
// Prevent CI success when an artifact is missing, stale, forged, incomplete
// or carries unsupported fields. No fetch, secrets, Cloudflare or deployment.
// Watchtower-Track: ops
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';
import {
  CLOUDFLARE_DIRECT_API_ROUTES, CLOUDFLARE_REWRITE_ROUTES,
} from '../workers/cloudflare-api-router.mjs';

export const STAGE9_PINNED_RECOVERY_SHA_V1 =
  'd4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0';
const EXPECTED_PROBES=58, EXPECTED_PROTECTED_HOLDS=6;
const CLASS_NAMES=Object.freeze(['static','health','api-denial','protected-hold']);
const COUNTERS=Object.freeze([
  'requestAttempts','responses','transportFailures','unexpectedStatuses',
  'http429','unexpected5xx','expectedHolds503',
]);
const ROOT_FIELDS=Object.freeze([
  'schema','evidenceSource','target','expectedCommit','attestedCommit',
  'githubRun','syntheticRequestCount','counters','groups','byRoute',
  'publicHtmlSha256','decision','notMeasured',
]);
const STAT_FIELDS=Object.freeze(['n','p50Ms','p95Ms','maxMs']);
const DECISION_FIELDS=Object.freeze([
  'preview','production','freeBudget','billing','cost','reasons',
]);
const NOT_MEASURED=Object.freeze([
  'workerCpu','workerMemory','realTraffic','realBillableRequests',
  'cloudflareChargedCost','supabaseOpenAiPortOneCost',
]);
const KNOWN_ROUTE_IDS=new Set([
  'static.root','static.other',
  ...HTML_ENTRIES.map(x=>'static.'+x),
  'api.unknown',
  ...CLOUDFLARE_DIRECT_API_ROUTES.map(x=>x.id),
  ...CLOUDFLARE_REWRITE_ROUTES.map(x=>x.id),
]);

function assert(condition) {
  if (!condition) throw Error('Stage 9 evidence acceptance failed (details redacted)');
}
const isRecord=value=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exactKeys=(value,names)=>isRecord(value)&&
  JSON.stringify(Object.keys(value).sort())===JSON.stringify([...names].sort());
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const positiveNumberString=(value,maxDigits)=>typeof value==='string'&&
  new RegExp('^[1-9][0-9]{0,'+maxDigits+'}$').test(value);

function checkStats(value) {
  assert(exactKeys(value,STAT_FIELDS));
  assert(Number.isSafeInteger(value.n)&&value.n>=0&&value.n<=EXPECTED_PROBES);
  const values=[value.p50Ms,value.p95Ms,value.maxMs];
  assert(values.every(n=>value.n===0?n===null:
    typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=120000));
  if(value.n>0) assert(values[0]<=values[1]&&values[1]<=values[2]);
  return value.n;
}

function checkOne(record,target,expectedSha,runId,attempt) {
  assert(exactKeys(record,ROOT_FIELDS));
  assert(record.schema==='myeongha-cloudflare-stage9-ci-evidence-v1'&&
    record.evidenceSource==='GITHUB_ACTIONS_SYNTHETIC_PREVIEW_HTTP'&&
    record.target===target&&record.expectedCommit===expectedSha&&
    record.attestedCommit===expectedSha&&
    exactKeys(record.githubRun,['id','attempt'])&&
    record.githubRun.id===runId&&record.githubRun.attempt===attempt&&
    record.syntheticRequestCount===EXPECTED_PROBES);

  assert(exactKeys(record.counters,COUNTERS));
  for(const key of COUNTERS){
    const n=record.counters[key];
    assert(Number.isSafeInteger(n)&&n>=0&&n<=EXPECTED_PROBES);
  }
  assert(record.counters.requestAttempts===EXPECTED_PROBES&&
    record.counters.responses===EXPECTED_PROBES&&
    record.counters.transportFailures===0&&
    record.counters.unexpectedStatuses===0&&
    record.counters.http429===0&&record.counters.unexpected5xx===0&&
    record.counters.expectedHolds503===EXPECTED_PROTECTED_HOLDS);

  assert(exactKeys(record.groups,CLASS_NAMES));
  let classTotal=0;
  for(const kind of CLASS_NAMES){
    const n=checkStats(record.groups[kind]);
    assert(n>0);
    classTotal+=n;
  }
  assert(classTotal===EXPECTED_PROBES&&
    record.groups['protected-hold'].n===EXPECTED_PROTECTED_HOLDS);

  // Current and pinned recovery versions may have different HTML bytes.
  // Each version must nevertheless attest all eleven public HTML files,
  // using the same exact SHA-256 naming and no arbitrary paths.
  assert(exactKeys(record.publicHtmlSha256,HTML_ENTRIES));
  for(const name of HTML_ENTRIES) {
    const digest=record.publicHtmlSha256[name];
    assert(typeof digest==='string'&&/^[a-f0-9]{64}$/.test(digest));
  }
  assert(isRecord(record.byRoute));
  const keys=Object.keys(record.byRoute);
  assert(keys.length>0&&keys.length<=KNOWN_ROUTE_IDS.size&&
    keys.every(name=>KNOWN_ROUTE_IDS.has(name)));
  let routeTotal=0;
  for(const name of keys) routeTotal+=checkStats(record.byRoute[name]);
  assert(routeTotal===EXPECTED_PROBES&&
    record.byRoute['static.root']?.n>0&&
    record.byRoute['api.health']?.n>0&&
    record.byRoute['rewrite.chat.turns']?.n>0);

  assert(exactKeys(record.decision,DECISION_FIELDS)&&
    record.decision.preview==='ALLOW_DENY_ONLY_PREVIEW'&&
    record.decision.production==='HOLD'&&
    record.decision.freeBudget==='INSUFFICIENT'&&
    record.decision.billing==='NOT_VERIFIED'&&
    record.decision.cost==='COST_OR_LIMIT_EVIDENCE_HOLD'&&
    Array.isArray(record.decision.reasons)&&
    record.decision.reasons.length===0);
  assert(Array.isArray(record.notMeasured)&&
    JSON.stringify(record.notMeasured)===JSON.stringify(NOT_MEASURED));
  return Object.freeze({
    target,commit:expectedSha,
    httpSamples:record.counters.requestAttempts,
    protected503:record.counters.expectedHolds503,
    stop:'ALLOW_DENY_ONLY_PREVIEW',
  });
}

export function acceptCloudflareStage9EvidencePairV1({
  current,recovery,head,runId,attempt,
}={}) {
  assert(sha(head)&&head!==STAGE9_PINNED_RECOVERY_SHA_V1&&
    positiveNumberString(runId,19)&&positiveNumberString(attempt,9));
  const live=checkOne(current,'current',head,runId,attempt);
  const standby=checkOne(recovery,'recovery',STAGE9_PINNED_RECOVERY_SHA_V1,
    runId,attempt);
  for(const group of CLASS_NAMES){
    // Both checks run the SAME static route matrix. Divergent route counts
    // cannot silently count as complete recovery evidence.
    assert(current.groups[group].n===recovery.groups[group].n);
  }
  assert(JSON.stringify(Object.keys(current.byRoute).sort())===
    JSON.stringify(Object.keys(recovery.byRoute).sort()));
  return Object.freeze({
    schema:'myeongha-cloudflare-stage9-evidence-pair-acceptance-v1',
    status:'PASS',githubRun:{id:runId,attempt},
    current:live,recovery:standby,
    production:'HOLD',cost:'COST_OR_LIMIT_EVIDENCE_HOLD',
    actualRollbackOrRestorePerformed:false,
  });
}

export async function readCloudflareStage9EvidencePairV1(cwd=process.cwd()) {
  const directory=resolve(cwd,'artifacts','cloudflare-preview-stage9');
  const ds=await lstat(directory);
  assert(ds.isDirectory()&&!ds.isSymbolicLink());
  const names=(await readdir(directory)).sort();
  assert(JSON.stringify(names)===JSON.stringify(['current.json','recovery.json']));
  const out={};
  for(const target of ['current','recovery']){
    const path=join(directory,target+'.json');
    const stat=await lstat(path);
    assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=65536);
    let value;
    try { value=JSON.parse(await readFile(path,'utf8')); }
    catch { throw Error('Stage 9 evidence JSON missing or malformed (redacted)'); }
    out[target]=value;
  }
  return out;
}

async function main() {
  const pair=await readCloudflareStage9EvidencePairV1();
  const result=acceptCloudflareStage9EvidencePairV1({
    ...pair,
    head:process.env.MYEONGHA_CLOUDFLARE_EVIDENCE_HEAD,
    runId:process.env.GITHUB_RUN_ID,
    attempt:process.env.GITHUB_RUN_ATTEMPT,
  });
  console.log('Cloudflare Stage 9 current/recovery pair accepted:',
    JSON.stringify(result));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{
    console.error('Cloudflare Stage 9 evidence pair REJECTED:',error.message);
    process.exitCode=1;
  });
}
