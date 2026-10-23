import { describe, expect, it } from 'vitest';
import {
  fetchCloudflareStage9LiveUsageV1,
  normalizeCloudflareStage9BuildHistoryV1,
  normalizeCloudflareStage9LiveUsageV1,
} from '../scripts/cloudflare-stage9-live-usage.mjs';

const fromUtc='2026-10-23T00:00:00.000Z';
const toUtc='2026-10-23T01:00:00.000Z';
const graphql={data:{viewer:{accounts:[{workersInvocationsAdaptive:[{sum:{requests:2,errors:0},quantiles:{cpuTimeP50:100,cpuTimeP95:200,cpuTimeP99:300}}]}]}}};
const builds={success:true,result:{has_reached_build_minutes_limit:false,build_minutes_refresh_on:'2026-10-31T23:59:59.999Z'}};
const account='a'.repeat(32), tag='b'.repeat(32), preview='c'.repeat(32);
const branch='feat/ops/cloudflare-authdb-clean-snapshot-20261021';
const one={
  build_uuid:'d'.repeat(32),
  created_on:'2026-10-23T00:15:00.000Z',
  running_on:'2026-10-23T00:15:01.000Z',
  stopped_on:'2026-10-23T00:15:41.000Z',
  status:'stopped',build_outcome:'success',
  build_trigger_metadata:{branch},
};
const page=items=>({result:items,result_info:{
  page:1,total_pages:1,next_page:false,count:items.length,
}});
describe('Ops Preview-only actual Workers Builds history (not main)',()=>{
  it('extracts exact Preview build counts and server-reported running wall time only',()=>{
    const summary=normalizeCloudflareStage9BuildHistoryV1({
      pages:[page([one])],fromUtc,toUtc,
    });
    expect(summary).toMatchObject({
      created:1,success:1,fail:0,
      completedWithRuntime:1,measuredRunWallSeconds:40,
      billingMinutes:null,
      scope:'OPS_PREVIEW_BUILDS_NOT_ACCOUNT_BUILD_MINUTES',
    });
  });
  it('rejects mixed main-branch records, duplicate identities and incomplete pagination',()=>{
    const outside={...one,build_uuid:'e'.repeat(32),
      build_trigger_metadata:{branch:'main'}};
    const args={pages:[page([outside])],fromUtc,toUtc};
    expect(normalizeCloudflareStage9BuildHistoryV1(args)).toBeNull();
    expect(normalizeCloudflareStage9BuildHistoryV1({
      ...args,pages:[page([one,one])],
    })).toBeNull();
    expect(normalizeCloudflareStage9BuildHistoryV1({
      ...args,pages:[{...page([one]),result_info:{
        ...page([one]).result_info,next_page:true,total_pages:2,
      }}],
    })).toBeNull();
  });
  it('reads the named ops Preview only and does not emit raw tags, tokens or main build data',async()=>{
    const calls=[];
    const fetchImpl=async(url,init)=>{
      calls.push(url);
      let body;
      if(url.endsWith('/graphql'))body=graphql;
      else if(url.endsWith('/builds/account/limits'))body=builds;
      else if(url.endsWith('/workers/scripts'))body={result:[{id:'myeongha',tag}]};
      else if(url.includes('/previews?page='))body={
        result:[{branch:'main',preview_id:'e'.repeat(32)},
          {branch,preview_id:preview}]};
      else if(url.includes('/previews/'+preview+'/builds'))body=page([one]);
      else throw Error('Unexpected read');
      return {ok:true,json:async()=>body};
    };
    const usage=await fetchCloudflareStage9LiveUsageV1({
      accountId:account,apiToken:'PRIVATE-TOKEN',now:new Date(toUtc),fetchImpl,
    });
    expect(calls).toHaveLength(5);
    expect(usage.buildHistory).toMatchObject({created:1,success:1});
    expect(usage.buildHistory.billingMinutes).toBeNull();
    expect(JSON.stringify(usage)).not.toContain(tag);
    expect(JSON.stringify(usage)).not.toContain(preview);
    expect(JSON.stringify(usage)).not.toContain('PRIVATE-TOKEN');
    expect(usage.costDecision).toBe('COST_OR_LIMIT_EVIDENCE_HOLD');
  });
  it('does not promote missing build history or account-wide billing claims',()=>{
    const r=normalizeCloudflareStage9LiveUsageV1({
      graphql,builds,fromUtc,toUtc,observedAtUtc:toUtc,
    });
    expect(r.buildHistory).toBeNull();
    expect(r.unavailable).toContain('OPS_PREVIEW_BUILD_HISTORY_HOLD');
    expect(r.productionCutover).toBe('HOLD');
  });
});
