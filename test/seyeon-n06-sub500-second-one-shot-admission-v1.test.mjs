import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertN06SecondOneShotV1,
  N06_SECOND_ONE_SHOT_MAX_RESERVE_KRW,
  N06_SECOND_ONE_SHOT_MAX_CALLS,
  N06_SECOND_ONE_SHOT_PREVIOUS_LUNA_RESERVE_MICRO_USD,
} from '../scripts/seyeon-n06-sub500-second-one-shot-admission-v1.mjs';
import {assertN06Cap500ReservationV1,N06_TERRA_RESERVE_MICRO_USD}
  from '../scripts/seyeon-terra-glm-quality-cap500-admission-v1.mjs';

const repo='gycha0109-beep/MyeongHa', sha='a'.repeat(40), id='39790000001';
const env={
  GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:sha,GITHUB_RUN_ID:id,
  GITHUB_WORKFLOW_REF:repo+'/.github/workflows/seyeon-n06-sub500-second-one-shot-v1.yml@refs/heads/main',
};
const history={total_count:1,workflow_runs:[{
  id:Number(id),head_sha:sha,event:'push',head_branch:'main',run_attempt:1,
}]};
const failure={id:39751436405,head_sha:'fd335626ceeb246840d0bfc0a29157656d932892',
  status:'completed',conclusion:'failure',run_attempt:1,event:'push',
  path:'.github/workflows/seyeon-terra-glm-quality-cap500-v1.yml'};
const correction={number:2474,merged:true,merge_commit_sha:'cc550c10104a888c39a50f4f11c2cadbbfc5ccdb'};

describe('user-approved second N06 pair: distinct one-shot, no silent rerun or price escalation',()=>{
  it('admits only this new main run with exact failed predecessor and merged correction',()=>{
    expect(assertN06SecondOneShotV1(env,history,failure,correction))
      .toEqual({runId:id,mainSha:sha});
    for(const altered of [
      {...env,GITHUB_RUN_ATTEMPT:'2'},
      {...env,GITHUB_EVENT_NAME:'workflow_dispatch'},
      {...env,GITHUB_REF:'refs/heads/feature'},
      {...env,GITHUB_WORKFLOW_REF:'another-runner'},
      {...env,GITHUB_SHA:'not-a-commit'},
    ])expect(()=>assertN06SecondOneShotV1(altered,history,failure,correction)).toThrow();
    for(const h of [
      {...history,total_count:2},
      {...history,workflow_runs:[{...history.workflow_runs[0],run_attempt:2}]},
      {...history,workflow_runs:[{...history.workflow_runs[0],head_sha:'b'.repeat(40)}]},
    ])expect(()=>assertN06SecondOneShotV1(env,h,failure,correction)).toThrow();
    for(const f of [
      {...failure,conclusion:'success'},
      {...failure,run_attempt:2},
      {...failure,head_sha:'b'.repeat(40)},
      {...failure,path:'.github/workflows/random.yml'},
    ])expect(()=>assertN06SecondOneShotV1(env,history,f,correction)).toThrow();
    expect(()=>assertN06SecondOneShotV1(env,history,failure,{...correction,merged:false})).toThrow();
    expect(()=>assertN06SecondOneShotV1(env,history,failure,{...correction,merge_commit_sha:sha})).toThrow();
  });
  it('retains 6 total calls, corrected 18789-byte Terra, 1536 output and worst-case KRW485',()=>{
    expect(N06_SECOND_ONE_SHOT_MAX_CALLS).toBe(6);
    expect(N06_SECOND_ONE_SHOT_MAX_RESERVE_KRW).toBe(485);
    expect(N06_SECOND_ONE_SHOT_MAX_RESERVE_KRW).toBeLessThan(500);
    expect(N06_SECOND_ONE_SHOT_PREVIOUS_LUNA_RESERVE_MICRO_USD).toBe(20000);
    const counts={luna:0,terra:0,glm:0};
    const stages=[
      ['luna',20000,5519],['terra',N06_TERRA_RESERVE_MICRO_USD,18789],
      ['terra',N06_TERRA_RESERVE_MICRO_USD,19200],
      ['glm',20000,19200],['glm',20000,19200],['glm',20000,19200],
    ];
    for(const [route,price,bytes] of stages){
      const reservation=assertN06Cap500ReservationV1(counts,price,route,bytes,1536);
      counts[route]+=1;
      expect(reservation.reserveUpperKrw).toBeLessThan(500);
      expect(reservation.cumulativePriorReserveUpperKrw).toBeLessThan(5000);
    }
    expect(counts).toEqual({luna:1,terra:2,glm:3});
    expect(()=>assertN06Cap500ReservationV1(counts,20000,'glm',100,1536)).toThrow();
  });
  it('only new workflow listens to its second-trial trigger and uses its own artifact namespace',()=>{
    const wf=readFileSync(new URL('../.github/workflows/seyeon-n06-sub500-second-one-shot-v1.yml',import.meta.url),'utf8');
    const runner=readFileSync(new URL('../scripts/run-seyeon-n06-sub500-second-one-shot-v1.mjs',import.meta.url),'utf8');
    expect(wf).toContain("'.github/seyeon-n06-sub500-second-one-shot-v1.trigger'");
    expect(wf).not.toContain('workflow_dispatch:');
    expect(wf).toContain('environment: production');
    expect(wf).toContain('ref: ${{ github.sha }}');
    expect(wf).toContain('N06 pair');
    expect(wf).toContain('node scripts/run-seyeon-n06-sub500-second-one-shot-v1.mjs');
    expect(runner).toContain('admitN06SecondOneShotV1()');
    expect(runner).toContain('assertN06Cap500ReservationV1');
    expect(runner).toContain('N06_TERRA_RESERVE_MICRO_USD as TERRA_RESERVE');
    expect(runner).toContain("'seyeon-n06-sub500-second-one-shot'");
    expect(runner).toContain('runSeyeonCensusFirstThreeCallShadowV1');
    expect(runner).toContain('createOpenAiSeyeonStructuredProviderV1');
    expect(runner).toContain('createOpenRouterSeyeonEvaluationProviderV1');
    expect(runner).not.toContain('admitN06Cap500OneShotV1()');
    expect(runner).not.toContain("id:'N10'");
    expect(runner).not.toContain("id:'N21'");
    expect(runner).toContain('productionPromotionPermitted:false');
    expect(runner).toContain("if(verdict!=='GUARD_N06_PAIR_PASS')process.exitCode=1;");
  });
});
