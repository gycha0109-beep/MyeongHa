import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertGlm53FlashPaidOneShotAdmissionV1} from '../scripts/seyeon-openrouter-glm53flash-paid-admission-v1.mjs';
const sha='a'.repeat(40),runId='39420009999';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:runId};
const history={total_count:1,workflow_runs:[{id:Number(runId),head_sha:sha,
 head_branch:'main',event:'push',run_attempt:1}]};
const previous={number:2410,merged:true,merge_commit_sha:'bc8c0889c10a1fa515037449682a75795c67a04e'};
const billing={number:2390,merged:true,merge_commit_sha:'83cdd2db8a836c7c6941beb5c815e3e116ec1663'};
describe('Paid GLM 5.3 Flash: one-shot public N01',()=>{
 it('rejects replays, retries, unmerged prerequisites and wrong refs',()=>{
  expect(assertGlm53FlashPaidOneShotAdmissionV1(env,history,previous,billing)).toEqual({runId,sha});
  expect(()=>assertGlm53FlashPaidOneShotAdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history,previous,billing)).toThrow();
  expect(()=>assertGlm53FlashPaidOneShotAdmissionV1(env,{...history,total_count:2},previous,billing)).toThrow();
  expect(()=>assertGlm53FlashPaidOneShotAdmissionV1(env,history,previous,{...billing,merged:false})).toThrow();
  expect(()=>assertGlm53FlashPaidOneShotAdmissionV1({...env,GITHUB_REF:'refs/heads/other'},history,previous,billing)).toThrow();
 });
 it('pins one paid model, three ordered stages, cap, full Guard suite and billing evidence',()=>{
  const src=readFileSync(new URL('../scripts/run-seyeon-openrouter-glm53flash-paid-n01-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-openrouter-glm53flash-paid-three-call-n01-v1.yml',import.meta.url),'utf8');
  expect(src).toContain("MODEL='z-ai/glm-5.3-flash',MAX_CALLS=3,MAX_TOKENS=1536");
  expect(src).toContain('TIMEOUT_MS=30000,PER_CALL_RESERVE_MICRO_USD=20000');
  expect(src).toContain('PRIOR_RESERVED_MICRO_USD=916554,OWNER_BUDGET_KRW=5000,FX_MAX=2500');
  expect(src).toContain("const id='synthetic:N01',text='안녕, 세연아!'");
  expect(src).toContain('getPaidGlm53FlashAdmissionV1(key)');
  expect(src).toContain('providerOnlyTag:chosenProviderTag');
  expect(src).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(src).toContain('lookupOpenRouterSeyeonGenerationChargeV1');
  expect(src).toContain('accountUsageBeforeMicroUsd,accountUsageAfterMicroUsd');
  expect(src).toContain('actualPaymentInvoiceReconciled:false');
  expect(src).toContain('characterQualityVerified:false,productionPromotionPermitted:false');
  expect(src).toContain("await ledger.appendFile(JSON.stringify(x)+'\\n');await ledger.sync();");
  expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(wf).toContain('environment: production');
  expect(wf).not.toContain('workflow_dispatch:');
 });
});
