import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 assertTerraGlmQualityTrioOneShotV1 as admission,
 requirePublicSyntheticQualityUtteranceV1 as reveal,
 SEYEON_TERRA_GLM_QUALITY_TRIO_PRIOR_RESERVED_MICRO_USD as PRIOR,
 SEYEON_TERRA_GLM_QUALITY_TRIO_TERRA_RESERVE_MICRO_USD as TERRA,
 SEYEON_TERRA_GLM_QUALITY_TRIO_GLM_RESERVE_MICRO_USD as GLM,
} from '../scripts/seyeon-terra-glm-quality-trio-admission-v1.mjs';
import {createSeyeonQualityTrioSyntheticCensusV1}
 from '../scripts/seyeon-terra-glm-quality-trio-census-v1.mjs';
import {getPaidGlm53FlashAdmissionV1}
 from '../scripts/seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
import {SEYEON_MODEL_EVAL_CASES_V1}
 from '../scripts/seyeon-model-eval-cases-v1.mjs';
const sha='a'.repeat(40),id='39699900123';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:id};
const history={total_count:1,workflow_runs:[{
 id:Number(id),head_sha:sha,event:'push',head_branch:'main',run_attempt:1,
}]};
const terraPR={number:2355,merged:true,merge_commit_sha:'d169ac46fcd67cc225ac7adc8f5c1d6b4f9941de'};
const terraRun={id:39352712484,status:'completed',conclusion:'success',run_attempt:1};
const glmPR={number:2418,merged:true,merge_commit_sha:'1715c4968f56391c05df160984a396501b8be151'};
const glmRun={id:39560101607,status:'completed',conclusion:'success',run_attempt:1,
 head_sha:'1715c4968f56391c05df160984a396501b8be151'};
const good={revealLevel:'public',memoryRefsMentioned:[],
 privateSourceRefsMentioned:[],disclosureSliceIds:[],
 utterance:'안녕하세요! 반가워요. 지금 뭐부터 해볼까요?'};
describe('Owner-visible PUBLIC synthetic persona trio Terra/GLM paired one-shot',()=>{
 it('pins previously validated runs, rejects replays, reruns and forged baseline',()=>{
  expect(admission(env,history,terraPR,terraRun,glmPR,glmRun)).toEqual({
   runId:id,mainSha:sha});
  expect(()=>admission({...env,GITHUB_RUN_ATTEMPT:'2'},history,terraPR,terraRun,glmPR,glmRun)).toThrow();
  expect(()=>admission(env,{...history,total_count:2},terraPR,terraRun,glmPR,glmRun)).toThrow();
  expect(()=>admission(env,history,terraPR,terraRun,glmPR,{...glmRun,conclusion:'failure'})).toThrow();
  expect(()=>admission(env,history,{...terraPR,merged:false},terraRun,glmPR,glmRun)).toThrow();
  expect(()=>admission({...env,GITHUB_REF:'refs/heads/feature'},history,terraPR,terraRun,glmPR,glmRun)).toThrow();
 });
 it('reveals the final utterance only after explicit public, no-memory, no-disclosure approval',()=>{
  expect(reveal(good)).toBe(good.utterance);
  for(const invalid of [
   {...good,revealLevel:'private'},
   {...good,memoryRefsMentioned:['memory:1']},
   {...good,privateSourceRefsMentioned:['source:1']},
   {...good,disclosureSliceIds:['slice:1']},
   {...good,utterance:'hi'},
   {...good,utterance:'  안녕하세요'},
   {...good,utterance:'안녕하세요\n더 알고 싶어요'},
   {...good,utterance:'아'.repeat(501)},
   {...good,privateSourceRefsMentioned:undefined},
  ])expect(()=>reveal(invalid)).toThrow();
 });
 it('limits three eight-POST public persona cases to the existing owner budget',()=>{
  const max=PRIOR+15*TERRA+9*GLM;
  expect(PRIOR).toBe(976554);
  expect(TERRA).toBe(50000);
  expect(GLM).toBe(20000);
  expect(max).toBe(1906554);
  expect(max*2500/1e6).toBeLessThan(5000);
  const samples=[
   ['N06','오늘은 네가 먼저 이야기해 줘.'],
   ['N10','편하게 농담 하나 해 줘.'],
   ['N21','친해지는 속도를 천천히 맞춰도 될까?'],
  ];
  for(const [id,text] of samples){
   const matches=SEYEON_MODEL_EVAL_CASES_V1.filter(x=>x.id===id);
   expect(matches).toHaveLength(1);
   expect(matches[0]).toMatchObject({text,topic:null});
  }
  expect(typeof getPaidGlm53FlashAdmissionV1).toBe('function');
 });
 it('accepts only the exact three existing synthetic cases with four guarded census reads',()=>{
  for(const id of ['N06','N10','N21']){
   const ref='synthetic:'+id;
   const census=createSeyeonQualityTrioSyntheticCensusV1(id,ref);
   const port=census.port;
   for(let i=0;i<4;i++){
    const row=port.readFullThreadCensus({
     subjectId:port.subjectId,threadId:port.threadId,currentUserMessageId:ref,
    });
    expect(row).toMatchObject({messageCount:1,latestSenderType:'user',complete:true});
   }
   expect(census.readCount).toBe(4);
   expect(()=>port.readFullThreadCensus({
    subjectId:port.subjectId,threadId:port.threadId,currentUserMessageId:ref,
   })).toThrow();
  }
  expect(()=>createSeyeonQualityTrioSyntheticCensusV1('N01','synthetic:N01')).toThrow();
  expect(()=>createSeyeonQualityTrioSyntheticCensusV1('N21','synthetic:OTHER')).toThrow();
 });
 it('checks strict provider options, existing runtime, fsync and ONLY final guarded utterance visible',()=>{
  const src=readFileSync(new URL('../scripts/run-seyeon-terra-glm-quality-trio-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-terra-glm-quality-trio-one-shot-v1.yml',import.meta.url),'utf8');
  expect(src).toContain('const execution=admitTerraGlmQualityTrioOneShotV1()');
  expect(src).toContain('const QUALITY_CASES=Object.freeze([');
  expect(src).toContain("id:'N06'");
  expect(src).toContain("id:'N10'");
  expect(src).toContain("id:'N21'");
  expect(src).toContain('preflight.funding?.availableMicroUsd<180000');
  expect(src).toContain("model:'gpt-5.6-terra'");
  expect(src).toContain("model:'z-ai/glm-5.3-flash'");
  expect(src).toContain('getPaidGlm53FlashAdmissionV1(glmKey)');
  expect(src).toContain('providerOnlyTag:selectedProvider');
  expect(src).toContain('runSeyeonCharacterTurnV2');
  expect(src).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(src).toContain('createSeyeonQualityTrioSyntheticCensusV1(spec.id,ID)');
  expect(src).toContain('await ledger.sync()');
  expect(src).toContain('verifySeyeonDialoguePathStageTopologyV1');
  expect(src).toContain("if(completePairs.length>0)");
  expect(src).toContain("verdict='GUARD_TRIO_PASS'");
  expect(src).toContain('SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_VISIBLE');
  expect(src).toContain('characterVoiceQualityVerified:false,productionPromotionPermitted:false');
  expect(src).toContain('metrics.terra.filter(x=>x.caseId===currentCase.id)');
  expect(src).not.toContain('OPENAI_API_KEY2');
  expect(wf).toContain('OPENAI_API_KEY: $'+'{{ secrets.OPENAI_API_KEY }}');
  expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(wf).toContain('environment: production');
  expect(wf).toContain('ref: $'+'{{ github.sha }}');
  expect(wf).not.toContain('workflow_dispatch:');
 });
});
