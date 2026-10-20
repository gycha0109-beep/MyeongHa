import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertNemotronFreeOneShotAdmissionV1} from '../scripts/seyeon-openrouter-nemotron-free-admission-v1.mjs';
const sha='a'.repeat(40),runId='39400009999';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:runId};
const history={total_count:1,workflow_runs:[{
 id:Number(runId),head_sha:sha,head_branch:'main',event:'push',run_attempt:1}]};
const previous={number:2382,merged:true,merge_commit_sha:'afd500c5f8638517ea24b430be736057c7a0aa6e'};
const billing={number:2386,merged:true,merge_commit_sha:'c710ad21a99d506b88269580dfd2a16222de5b84'};
describe('Nemotron 3 Super free one-shot public Shadow',()=>{
 it('rejects duplicate, replay, and unmerged pricing instrumentation',()=>{
  expect(assertNemotronFreeOneShotAdmissionV1(env,history,previous,billing))
   .toEqual({runId,sha});
  expect(()=>assertNemotronFreeOneShotAdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history,previous,billing)).toThrow();
  expect(()=>assertNemotronFreeOneShotAdmissionV1(env,{...history,total_count:2},previous,billing)).toThrow();
  expect(()=>assertNemotronFreeOneShotAdmissionV1(env,history,previous,{...billing,merged:false})).toThrow();
 });
 it('pins only N01, exactly three-stage cap, old budget, no user data or fallback',()=>{
  const script=readFileSync(new URL('../scripts/run-seyeon-openrouter-nemotron-free-n01-v1.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/seyeon-openrouter-nemotron-free-three-call-n01-v1.yml',import.meta.url),'utf8');
  expect(script).toContain("MODEL='nvidia/nemotron-3-super-120b-a12b:free',MAX_CALLS=3,MAX_TOKENS=1536");
  expect(script).toContain('PRIOR_RESERVED_MICRO_USD=896554,OWNER_BUDGET_KRW=5000,FX_MAX=2500');
  expect(script).toContain("const id='synthetic:N01',text='안녕, 세연아!'");
  expect(script).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(script).toContain("await ledger.appendFile(JSON.stringify(x)+'\\n');await ledger.sync();");
  expect(script).toContain('lookupOpenRouterSeyeonGenerationChargeV1');
  expect(script).toContain('approvedSyntheticFreeVariant:true');
  expect(script).toContain('FREE_MODEL_RATE_MICRO_USD=0');
  expect(script).not.toContain('console.log(m.generationId');
  expect(script).toContain('actualPaymentInvoiceReconciled:false');
  expect(script).toContain('characterQualityVerified:false,productionPromotionPermitted:false');
  expect(workflow).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(workflow).not.toContain('workflow_dispatch:');
  expect(workflow).not.toContain('OPENAI_API_KEY:');
 });
});
