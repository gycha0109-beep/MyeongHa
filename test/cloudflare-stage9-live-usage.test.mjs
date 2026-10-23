import { describe, expect, it } from 'vitest';
import { fetchCloudflareStage9LiveUsageV1, normalizeCloudflareStage9LiveUsageV1 } from '../scripts/cloudflare-stage9-live-usage.mjs';
import { assessCloudflarePreviewOpsStopGateV1 } from '../scripts/cloudflare-preview-ops-stop-gate.mjs';
import { summarizeCloudflarePreviewProbeMetricsV1 } from '../scripts/cloudflare-preview-smoke-metrics.mjs';

const fromUtc='2026-10-23T00:00:00.000Z';
const toUtc='2026-10-23T01:00:00.000Z';
const graphql={data:{viewer:{accounts:[{workersInvocationsAdaptive:[{
  sum:{requests:2715,errors:0},
  quantiles:{cpuTimeP50:429,cpuTimeP95:1350,cpuTimeP99:2134},
}]}]}}};
const builds={success:true,result:{
  has_reached_build_minutes_limit:false,
  build_minutes_refresh_on:'2026-10-31T23:59:59.999Z',
}};
const make=(other={})=>normalizeCloudflareStage9LiveUsageV1({
  graphql,builds,fromUtc,toUtc,observedAtUtc:toUtc,...other,
});
const metrics=summarizeCloudflarePreviewProbeMetricsV1([
  {path:'/',expectedStatus:200,actualStatus:200,elapsedMs:1},
  {path:'/api/health',expectedStatus:200,actualStatus:200,elapsedMs:1},
  {path:'/api/me',expectedStatus:404,actualStatus:404,elapsedMs:1},
  {path:'/api/chat/x/turns',expectedStatus:503,actualStatus:503,elapsedMs:1},
]);
const stop=usage=>assessCloudflarePreviewOpsStopGateV1({
  usage,metrics,expectedCommit:'a'.repeat(40),attestedCommit:'a'.repeat(40),
});
describe('read-only live Cloudflare usage evidence',()=>{
  it('measures script-wide invocations and CPU in ms, not HTTP latency or route CPU',()=>{
    const r=make();
    expect(r.worker).toMatchObject({requests:2715,executionErrors:0,
      cpuP50Ms:0.429,cpuP95Ms:1.35,cpuP99Ms:2.134});
    expect(r.builds.minutesExhausted).toBe(false);
    expect(r.notMeasured).toContain('perRouteCpuP50P95Max');
    expect(r.notMeasured).toContain('cloudflareChargedCost');
    expect(r.stopGateUsage.workerCpuP95Ms).toBe(1.35);
    expect(r.stopGateUsage).not.toHaveProperty('workerRequestsTodayUtc');
    expect(r.productionCutover).toBe('HOLD');
  });
  it('never replaces denied, malformed or missing data with zero',()=>{
    const r=make({graphql:{errors:[{message:'PRIVATE'}]},builds:{success:false}});
    expect(r.worker).toBeNull();
    expect(r.builds).toBeNull();
    expect(r.stopGateUsage.scriptRequestsTodayUtc).toBeNull();
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
    const invalid=structuredClone(graphql);
    invalid.data.viewer.accounts[0].workersInvocationsAdaptive[0].sum.errors=3000;
    expect(make({graphql:invalid}).worker).toBeNull();
    expect(()=>make({fromUtc:'2026-10-24T00:00:00.000Z'})).toThrow();
  });
  it('reads only approved Cloudflare analytics/builds endpoints; sanitizes provider data',async()=>{
    const calls=[];
    const f=async(url,init)=>{
      calls.push({url,init});
      return {ok:true,json:async()=>url.endsWith('/graphql')?graphql:builds};
    };
    const r=await fetchCloudflareStage9LiveUsageV1({
      accountId:'a'.repeat(32),apiToken:'PRIVATE-TOKEN',
      now:new Date(toUtc),fetchImpl:f,
    });
    expect(calls.map(c=>c.init.method)).toEqual(['POST','GET','GET']);
    expect(calls[2].url).toContain('/workers/scripts');
    expect(r.buildHistory).toBeNull();
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(calls[1].url).toContain('/builds/account/limits');
    expect(r.worker.requests).toBe(2715);
    expect(JSON.stringify(r)).not.toContain('PRIVATE-TOKEN');
    expect(JSON.stringify(r)).not.toContain('a'.repeat(32));
  });
  it('fails closed on a 403 while permitting independently available Builds evidence',async()=>{
    const r=await fetchCloudflareStage9LiveUsageV1({
      accountId:'a'.repeat(32),apiToken:'PRIVATE-TOKEN',
      now:new Date(toUtc),
      fetchImpl:async(url)=>url.endsWith('/graphql')
        ? {ok:false,status:403} : {ok:true,json:async()=>builds},
    });
    expect(r.worker).toBeNull();
    expect(r.builds.minutesExhausted).toBe(false);
    expect(r.costDecision).toBe('COST_OR_LIMIT_EVIDENCE_HOLD');
  });
  it('uses measured p95/spike only as stop signals; incomplete Free/billing remains HOLD',()=>{
    const ok=stop(make().stopGateUsage);
    expect(ok.previewDecision).toBe('ALLOW_DENY_ONLY_PREVIEW');
    expect(ok.freeBudgetEvidence).toBe('INSUFFICIENT');
    expect(ok.productionCutover).toBe('HOLD');
    const spike=stop({...make().stopGateUsage,
      scriptRequestsTodayUtc:100000,workerCpuP95Ms:12});
    expect(spike.previewDecision).toBe('STOP_REHEARSAL');
    expect(spike.reasons).toContain('FREE_DAILY_REQUEST_BUDGET_EXHAUSTED');
    expect(spike.reasons).toContain('FREE_CPU_BUDGET_UNSAFE');
    expect(()=>stop({workerCpuP95Ms:-2})).toThrow();
  });
});
