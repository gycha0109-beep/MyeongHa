import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HTML_ENTRIES } from '../scripts/verify-cloudflare-static.mjs';
import { STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1 } from '../scripts/cloudflare-preview-negative-replay.mjs';
import {
  acceptCloudflareStage9EvidencePairV1,
  readCloudflareStage9EvidencePairV1,
  STAGE9_PINNED_RECOVERY_SHA_V1,
} from '../scripts/accept-cloudflare-stage9-evidence-pair.mjs';
import { buildCloudflarePreviewSmokeEvidenceV1 } from '../scripts/cloudflare-preview-smoke-evidence.mjs';
import { summarizeCloudflarePreviewProbeMetricsV1 } from '../scripts/cloudflare-preview-smoke-metrics.mjs';
import { assessCloudflarePreviewOpsStopGateV1 } from '../scripts/cloudflare-preview-ops-stop-gate.mjs';

const HEAD='a'.repeat(40),RUN='39799999999',ATTEMPT='1';
const sample=(path,expectedStatus,actualStatus,elapsedMs)=>({
  path,expectedStatus,actualStatus,elapsedMs,
});
const probes=[
  ...Array.from({length:53},(_,i)=>sample(i%2?'/index.html':'/',200,200,10+i)),
  sample('/api/health',200,200,20),
  sample('/api/me',404,404,21),
  sample('/api/memories/synthetic-id/grants/seyeon',404,404,23),
  sample('/api/memories/synthetic-id/grants/seyeon/revoke',404,404,24),
  ...Array.from({length:7},(_,i)=>sample(
    '/api/chat/PRIVATE-THREAD/turns?state=SECRET',503,503,22+i)),
];
const metrics=summarizeCloudflarePreviewProbeMetricsV1(probes);
const make= (target,sha)=>{
  const stopGate=assessCloudflarePreviewOpsStopGateV1({
    metrics,expectedCommit:sha,attestedCommit:sha,
  });
  return buildCloudflarePreviewSmokeEvidenceV1({
    target,expectedCommit:sha,attestedCommit:sha,metrics,stopGate,
    githubRunId:RUN,githubRunAttempt:ATTEMPT,
    htmlSha256:Object.fromEntries(HTML_ENTRIES.map(x=>[x,'d'.repeat(64)])),
    negativeReplayFences:STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1,
  });
};
const current=make('current',HEAD);
const recovery=make('recovery',STAGE9_PINNED_RECOVERY_SHA_V1);
const pair=(change={})=>acceptCloudflareStage9EvidencePairV1({
  current,recovery,head:HEAD,runId:RUN,attempt:ATTEMPT,...change,
});

describe('Cloudflare Stage 9 exact-SHA CI evidence pair acceptance',()=>{
  it('admits two matching-run, held, sanitized 64-probe records only',()=>{
    const result=pair();
    expect(result).toMatchObject({
      schema:'myeongha-cloudflare-stage9-evidence-pair-acceptance-v1',
      status:'PASS',production:'HOLD',cost:'COST_OR_LIMIT_EVIDENCE_HOLD',
      githubRun:{id:RUN,attempt:ATTEMPT},
      current:{commit:HEAD,httpSamples:64,protected503:7},
      recovery:{commit:STAGE9_PINNED_RECOVERY_SHA_V1,httpSamples:64,protected503:7},
      actualRollbackOrRestorePerformed:false,
    });
    expect(current.byRoute['rewrite.seyeon.memory.grant.status'].n).toBe(1);
    expect(current.byRoute['rewrite.seyeon.memory.grant.revoke'].n).toBe(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE-THREAD');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('never accepts stale head, swapped candidate or a different GitHub attempt',()=>{
    for(const candidate of [
      {head:'b'.repeat(40)},
      {head:STAGE9_PINNED_RECOVERY_SHA_V1},
      {runId:'39799999998'},
      {attempt:'2'},
      {recovery:{...recovery,expectedCommit:HEAD,attestedCommit:HEAD}},
      {current:{...current,githubRun:{id:RUN,attempt:'2'}}},
      {current:{...current,attestedCommit:'b'.repeat(40)}},
      {current:{...current,githubRun:{id:'0',attempt:ATTEMPT}}},
    ])expect(()=>pair(candidate)).toThrow(/Stage 9 evidence acceptance failed/);
  });

  it('rejects fake protected HOLD, billing approval, route and status pollution',()=>{
    for(const changed of [
      {current:{...current,decision:{...current.decision,production:'GO'}}},
      {current:{...current,decision:{...current.decision,preview:'STOP_REHEARSAL'}}},
      {current:{...current,decision:{...current.decision,billing:'ACCOUNT_READ_CONFIRMED'}}},
      {current:{...current,notMeasured:[]}},
      {current:{...current,negativeReplayFences:{}}},
      {current:{...current,negativeReplayFences:{
        ...STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1,
        'commerce.webhook.duplicate':'ENABLED'}}},
      {current:{...current,publicHtmlSha256:{}}},
      {current:{...current,publicHtmlSha256:{...current.publicHtmlSha256,
        'auth.html':'INVALID-DIGEST'}}},
      {recovery:{...recovery,publicHtmlSha256:{...recovery.publicHtmlSha256,
        'new-private.html':'f'.repeat(64)}}},
      {current:{...current,syntheticRequestCount:62}},
      {current:{...current,byRoute:Object.fromEntries(
        Object.entries(current.byRoute).filter(([name])=>name!==
          'rewrite.seyeon.memory.grant.status'))}},
      {current:{...current,counters:{...current.counters,expectedHolds503:0}}},
      {current:{...current,counters:{...current.counters,http429:1}}},
      {current:{...current,groups:{...current.groups,
        'protected-hold':{...current.groups['protected-hold'],n:0}}}},
      {current:{...current,byRoute:{...current.byRoute,
        'PRIVATE-THREAD-ID':{n:1,p50Ms:1,p95Ms:1,maxMs:1}}}},
      {current:{...current,secret:'PRIVATE-SECRET'}},
      {recovery:{...recovery,byRoute:{...recovery.byRoute,
        'static.root':{...recovery.byRoute['static.root'],n:1}}}},
    ])expect(()=>pair(changed)).toThrow(/Stage 9 evidence acceptance failed/);
  });

  it('requires two complete files, disallows extra files and symlinks',async()=>{
    const root=await mkdtemp(join(tmpdir(),'myeongha-cf9-pair-'));
    const dir=join(root,'artifacts','cloudflare-preview-stage9');
    try {
      await mkdir(dir,{recursive:true});
      await writeFile(join(dir,'current.json'),JSON.stringify(current));
      await expect(readCloudflareStage9EvidencePairV1(root)).rejects.toThrow();
      await writeFile(join(dir,'recovery.json'),JSON.stringify(recovery));
      expect(pair(await readCloudflareStage9EvidencePairV1(root)).status).toBe('PASS');
      await writeFile(join(dir,'unexpected.json'),'{}');
      await expect(readCloudflareStage9EvidencePairV1(root)).rejects.toThrow();
      await rm(join(dir,'unexpected.json'));
      await rm(join(dir,'recovery.json'));
      await symlink(join(dir,'current.json'),join(dir,'recovery.json'));
      await expect(readCloudflareStage9EvidencePairV1(root)).rejects.toThrow();
      await rm(join(dir,'recovery.json'));
      await writeFile(join(dir,'recovery.json'),'{broken-json');
      await expect(readCloudflareStage9EvidencePairV1(root))
        .rejects.toThrow(/malformed/);
    }finally {
      await rm(root,{recursive:true,force:true});
    }
  });
});
