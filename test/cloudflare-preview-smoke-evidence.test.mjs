import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HTML_ENTRIES } from '../scripts/verify-cloudflare-static.mjs';
import {
  buildCloudflarePreviewSmokeEvidenceV1,
  writeCloudflarePreviewSmokeEvidenceV1,
} from '../scripts/cloudflare-preview-smoke-evidence.mjs';
import { summarizeCloudflarePreviewProbeMetricsV1 } from '../scripts/cloudflare-preview-smoke-metrics.mjs';
import { assessCloudflarePreviewOpsStopGateV1 } from '../scripts/cloudflare-preview-ops-stop-gate.mjs';

const SHA='a'.repeat(40);
const metrics=summarizeCloudflarePreviewProbeMetricsV1([
  {path:'/',expectedStatus:200,actualStatus:200,elapsedMs:11.3},
  {path:'/api/health',expectedStatus:200,actualStatus:200,elapsedMs:15.3},
  {path:'/api/me',expectedStatus:404,actualStatus:404,elapsedMs:21.3},
  {path:'/api/chat/SECRET-THREAD-ID/turns?token=PRIVATE_SECRET',
   expectedStatus:503,actualStatus:503,elapsedMs:17.4},
]);
const stopGate=assessCloudflarePreviewOpsStopGateV1({
  metrics,expectedCommit:SHA,attestedCommit:SHA,
});
const make=(updates={})=>buildCloudflarePreviewSmokeEvidenceV1({
  target:'current',expectedCommit:SHA,attestedCommit:SHA,
  metrics,stopGate,
  htmlSha256:Object.fromEntries(HTML_ENTRIES.map(x=>[x,'c'.repeat(64)])),
  ...updates,
});

describe('Stage 9 immutable, scrubbed CI evidence artifact',()=>{
  it('copies only named routes and bounded stats; never accepts raw secrets',()=>{
    const result=make({
      extraValue:'PRIVATE_SECRET',
      metrics:{...metrics,transportBody:'PRIVATE_SECRET'},
      stopGate:{...stopGate,secret:'PRIVATE_SECRET'},
    });
    expect(result).toMatchObject({
      schema:'myeongha-cloudflare-stage9-ci-evidence-v1',
      evidenceSource:'GITHUB_ACTIONS_SYNTHETIC_PREVIEW_HTTP',
      target:'current',expectedCommit:SHA,attestedCommit:SHA,
      syntheticRequestCount:4,
      decision:{preview:'ALLOW_DENY_ONLY_PREVIEW',
        production:'HOLD',freeBudget:'INSUFFICIENT',
        billing:'NOT_VERIFIED',cost:'COST_OR_LIMIT_EVIDENCE_HOLD'},
    });
    expect(result.counters.expectedHolds503).toBe(1);
    expect(result.byRoute['rewrite.chat.turns'].n).toBe(1);
    expect(Object.keys(result.publicHtmlSha256).sort()).toEqual([...HTML_ENTRIES].sort());
    expect(result.publicHtmlSha256['index.html']).toBe('c'.repeat(64));
    const serial=JSON.stringify(result);
    expect(serial).not.toContain('PRIVATE_SECRET');
    expect(serial).not.toContain('SECRET-THREAD-ID');
    expect(serial).not.toContain('/api/chat/');
    expect(serial).not.toContain('transportBody');
    expect(result.notMeasured).toContain('workerCpu');
  });

  it('rejects unapproved destinations, wrong SHA and injected route IDs',()=>{
    for(const overrides of [
      {target:'../outside'}, {target:'production'},
      {attestedCommit:'b'.repeat(40)},
      {expectedCommit:'not-a-commit'},
      {metrics:{...metrics,byRoute:{...metrics.byRoute,'rewrite.private-secret':{n:1,p50Ms:1,p95Ms:1,maxMs:1}}}},
      {stopGate:{...stopGate,reasons:['PRIVATE_SECRET']}},
      {stopGate:{...stopGate,productionCutover:'GO'}},
      {stopGate:{...stopGate,automaticProductionMutation:true}},
      {htmlSha256:Object.fromEntries(HTML_ENTRIES.slice(1).map(x=>[x,'a'.repeat(64)]))},
      {htmlSha256:{...Object.fromEntries(HTML_ENTRIES.map(x=>[x,'a'.repeat(64)])),
        'api/secret.json':'a'.repeat(64)}},
      {htmlSha256:Object.fromEntries(HTML_ENTRIES.map(x=>[x,'SECRET-HTML-CONTENT']))},
    ]) expect(()=>make(overrides)).toThrow();
  });

  it('writes two non-overwriting, read-only evidence files in an isolated test dir',async()=>{
    const cwd=await mkdtemp(join(tmpdir(),'myeongha-stage9-evidence-'));
    try {
      const current=make();
      const recovery=make({target:'recovery'});
      await writeCloudflarePreviewSmokeEvidenceV1('current',current,cwd);
      await writeCloudflarePreviewSmokeEvidenceV1('recovery',recovery,cwd);
      const names=await readdir(join(cwd,'artifacts','cloudflare-preview-stage9'));
      expect(names.sort()).toEqual(['current.json','recovery.json']);
      const roundTrip=JSON.parse(await readFile(
        join(cwd,'artifacts','cloudflare-preview-stage9','current.json'),'utf8'));
      expect(roundTrip).toEqual(current);
      await expect(writeCloudflarePreviewSmokeEvidenceV1('current',current,cwd))
        .rejects.toThrow();
      await expect(writeCloudflarePreviewSmokeEvidenceV1('../other',current,cwd))
        .rejects.toThrow();
    } finally {
      await rm(cwd,{recursive:true,force:true});
    }
  });
});
