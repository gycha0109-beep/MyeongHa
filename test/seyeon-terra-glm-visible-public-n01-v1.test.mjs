import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 assertTerraGlmVisibleN01OneShotV1 as admission,
 requirePublicSyntheticN01UtteranceV1 as reveal,
 SEYEON_TERRA_GLM_PUBLIC_N01_PRIOR_RESERVED_MICRO_USD as PRIOR,
 SEYEON_TERRA_GLM_PUBLIC_N01_TERRA_RESERVE_MICRO_USD as TERRA,
 SEYEON_TERRA_GLM_PUBLIC_N01_GLM_RESERVE_MICRO_USD as GLM,
} from '../scripts/seyeon-terra-glm-visible-public-n01-admission-v1.mjs';
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
describe('Owner-visible PUBLIC synthetic N01 Terra/GLM paired one-shot',()=>{
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
 it('limits one eight-POST public N01 to the existing owner budget',()=>{
  const max=PRIOR+5*TERRA+3*GLM;
  expect(PRIOR).toBe(976554);
  expect(TERRA).toBe(80000);
  expect(GLM).toBe(20000);
  expect(max).toBe(1436554);
  expect(max*2500/1e6).toBeLessThan(5000);
  const n01=SEYEON_MODEL_EVAL_CASES_V1.filter(x=>x.id==='N01');
  expect(n01).toHaveLength(1);
  expect(n01[0].text).toBe('안녕, 세연아!');
  expect(typeof getPaidGlm53FlashAdmissionV1).toBe('function');
 });
 it('checks strict provider options, existing runtime, fsync and ONLY final guarded utterance visible',()=>{
  const src=readFileSync(new URL('../scripts/run-seyeon-terra-glm-visible-public-n01-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-terra-glm-visible-public-n01-one-shot-v1.yml',import.meta.url),'utf8');
  expect(src).toContain('const execution=admitTerraGlmVisibleN01OneShotV1()');
  expect(src).toContain("spec.text!=='안녕, 세연아!'");
  expect(src).toContain("model:'gpt-5.6-terra'");
  expect(src).toContain("model:'z-ai/glm-5.3-flash'");
  expect(src).toContain('getPaidGlm53FlashAdmissionV1(glmKey)');
  expect(src).toContain('providerOnlyTag:selectedProvider');
  expect(src).toContain('runSeyeonCharacterTurnV2');
  expect(src).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(src).toContain('await ledger.sync()');
  expect(src).toContain('verifySeyeonDialoguePathStageTopologyV1');
  expect(src).toContain("if(verdict==='GUARD_PAIR_PASS')");
  expect(src).toContain('SEYEON_TERRA_GLM_N01_OWNER_VISIBLE');
  expect(src).toContain('characterVoiceQualityVerified:false,productionPromotionPermitted:false');
  expect(src).not.toContain('OPENAI_API_KEY2');
  expect(wf).toContain('OPENAI_API_KEY: $'+'{{ secrets.OPENAI_API_KEY }}');
  expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(wf).toContain('environment: production');
  expect(wf).toContain('ref: $'+'{{ github.sha }}');
  expect(wf).not.toContain('workflow_dispatch:');
 });
});
