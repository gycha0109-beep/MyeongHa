import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertGptOss120bOneShotAdmissionV1} from '../scripts/seyeon-openrouter-gptoss120b-admission-v1.mjs';
const sha='a'.repeat(40),runId='39400009999';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:runId};
const history={total_count:1,workflow_runs:[{
 id:Number(runId),head_sha:sha,head_branch:'main',event:'push',run_attempt:1}]};
const previous={number:2374,merged:true,merge_commit_sha:'fcfc66bd5390d2edee900223c40b6588a75921a2'};
const billing={number:2380,merged:true,merge_commit_sha:'f92a904c745b3812089b6c138dea026456d48c15'};
describe('GPT-OSS 120B one-shot public Shadow',()=>{
 it('rejects duplicate, replay, and unmerged pricing instrumentation',()=>{
  expect(assertGptOss120bOneShotAdmissionV1(env,history,previous,billing))
   .toEqual({runId,sha});
  expect(()=>assertGptOss120bOneShotAdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history,previous,billing)).toThrow();
  expect(()=>assertGptOss120bOneShotAdmissionV1(env,{...history,total_count:2},previous,billing)).toThrow();
  expect(()=>assertGptOss120bOneShotAdmissionV1(env,history,previous,{...billing,merged:false})).toThrow();
 });
 it('pins only N01, exactly three-stage cap, old budget, no user data or fallback',()=>{
  const script=readFileSync(new URL('../scripts/run-seyeon-openrouter-gptoss120b-n01-v1.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/seyeon-openrouter-gptoss120b-three-call-n01-v1.yml',import.meta.url),'utf8');
  expect(script).toContain("MODEL='openai/gpt-oss-120b',MAX_CALLS=3,MAX_TOKENS=1536");
  expect(script).toContain('PRIOR_RESERVED_MICRO_USD=876554,OWNER_BUDGET_KRW=5000,FX_MAX=2500');
  expect(script).toContain("const id='synthetic:N01',text='안녕, 세연아!'");
  expect(script).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(script).toContain("await ledger.appendFile(JSON.stringify(x)+'\\n');await ledger.sync();");
  expect(script).toContain('lookupOpenRouterSeyeonGenerationChargeV1');
  expect(script).not.toContain('console.log(m.generationId');
  expect(script).toContain('actualPaymentInvoiceReconciled:false');
  expect(script).toContain('characterQualityVerified:false,productionPromotionPermitted:false');
  expect(workflow).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(workflow).not.toContain('workflow_dispatch:');
  expect(workflow).not.toContain('OPENAI_API_KEY:');
 });
});
