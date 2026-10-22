import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertN06Cap500OneShotV1,
  assertN06Cap500ReservationV1,
  N06_MAX_RESERVED_KRW,N06_RESERVED_MICRO_USD,
  N06_CAP500_OWNER_KRW,N06_MAX_CALLS,N06_MAX_REQUEST_BODY_BYTES,
} from '../scripts/seyeon-terra-glm-quality-cap500-admission-v1.mjs';

const repo='gycha0109-beep/MyeongHa';
const sha='a'.repeat(40);
const env={
  GITHUB_REPOSITORY:repo,
  GITHUB_WORKFLOW_REF:repo+'/.github/workflows/seyeon-terra-glm-quality-cap500-v1.yml@refs/heads/main',
  GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
  GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:'123456789',
};
const history={total_count:1,workflow_runs:[{
  id:123456789,head_sha:sha,event:'push',head_branch:'main',run_attempt:1,
}]};
const steps=[
  {route:'luna',limit:20000},
  {route:'terra',limit:50000},
  {route:'terra',limit:50000},
  {route:'glm',limit:20000},
  {route:'glm',limit:20000},
  {route:'glm',limit:20000},
];
const zero=()=>({luna:0,terra:0,glm:0});

describe('single budgeted N06 Luna+Terra x3 / GLM x3 quality pair',()=>{
  it('permits exactly one head/run and refuses retries, manual dispatch and duplicates',()=>{
    expect(assertN06Cap500OneShotV1(env,history)).toEqual({
      runId:'123456789',mainSha:sha,
    });
    for(const altered of [
      {...env,GITHUB_RUN_ATTEMPT:'2'},
      {...env,GITHUB_EVENT_NAME:'workflow_dispatch'},
      {...env,GITHUB_REF:'refs/heads/experiment'},
      {...env,GITHUB_WORKFLOW_REF:'repo/attacker'},
    ])expect(()=>assertN06Cap500OneShotV1(altered,history)).toThrow();
    for(const bad of [
      {total_count:2,workflow_runs:history.workflow_runs},
      {total_count:1,workflow_runs:[{...history.workflow_runs[0],run_attempt:2}]},
      {total_count:1,workflow_runs:[{...history.workflow_runs[0],head_sha:'b'.repeat(40)}]},
    ])expect(()=>assertN06Cap500OneShotV1(env,bad)).toThrow();
  });

  it('caps six dispatch reservations below 500 KRW, including prior legacy global budget',()=>{
    expect(N06_MAX_CALLS).toBe(6);
    expect(N06_RESERVED_MICRO_USD).toBe(180000);
    expect(N06_MAX_RESERVED_KRW).toBe(450);
    expect(N06_MAX_RESERVED_KRW).toBeLessThan(N06_CAP500_OWNER_KRW);
    const counts=zero();
    for(const {route,limit} of steps){
      const result=assertN06Cap500ReservationV1(
        counts,limit,route,N06_MAX_REQUEST_BODY_BYTES,1536,
      );
      counts[route]+=1;
      expect(result.reserveUpperKrw).toBeLessThan(500);
      expect(result.cumulativePriorReserveUpperKrw).toBeLessThan(5000);
    }
    expect(counts).toEqual({luna:1,terra:2,glm:3});
  });

  it('rejects seventh call, repeated stage, oversized request, output expansion or price bypass',()=>{
    const all={luna:1,terra:2,glm:3};
    for(const stage of steps){
      expect(()=>assertN06Cap500ReservationV1(
        all,stage.limit,stage.route,512,1536,
      )).toThrow();
    }
    expect(()=>assertN06Cap500ReservationV1(zero(),20000,'luna',15681,1536)).toThrow();
    expect(()=>assertN06Cap500ReservationV1(zero(),20000,'luna',15680,1537)).toThrow();
    expect(()=>assertN06Cap500ReservationV1(zero(),19999,'luna',15680,1536)).toThrow();
    expect(()=>assertN06Cap500ReservationV1(zero(),50000,'terra',15680,1536)).not.toThrow();
    expect(()=>assertN06Cap500ReservationV1(zero(),50000,'wrong',512,1536)).toThrow();
  });

  it('has exactly N06 synthetic text, retains existing 3-stage Guard and no retry/fallback',()=>{
    const source=readFileSync(new URL(
      '../scripts/run-seyeon-terra-glm-quality-cap500-v1.mjs',import.meta.url),'utf8');
    expect(source).toContain("id:'N06',text:'오늘은 네가 먼저 이야기해 줘.'");
    expect(source).not.toContain("id:'N10'");
    expect(source).not.toContain("id:'N21'");
    expect(source).toContain('runSeyeonCensusFirstThreeCallShadowV1');
    expect(source).toContain('createOpenAiSeyeonStructuredProviderV1');
    expect(source).toContain('createOpenRouterSeyeonEvaluationProviderV1');
    expect(source).toContain('requirePublicSyntheticQualityUtteranceV1');
    expect(source).toContain('admitN06Cap500OneShotV1()');
    expect(source).toContain('assertN06Cap500ReservationV1');
    expect(source).toContain("const cap=route==='luna'?1:2");
    expect(source).toContain("await reserve('glm',expected,m.requestBodyBytes,GLM_RESERVE,3)");
    expect(source).toContain("if(verdict!=='GUARD_N06_PAIR_PASS')process.exitCode=1;");
    expect(source).not.toContain('admitTerraGlmQualityTrioRetryOneShotV1');
    expect(source).not.toContain('ProductionRoute');
  });
});
