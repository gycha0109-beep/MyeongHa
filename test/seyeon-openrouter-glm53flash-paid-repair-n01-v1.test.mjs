import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {getPaidGlm53FlashAdmissionV1} from '../scripts/seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
import {assertGlm53FlashPaidRepairAdmissionV1} from '../scripts/seyeon-openrouter-glm53flash-paid-repair-admission-v1.mjs';
const sha='a'.repeat(40),runId='39599900123';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:runId};
const history={total_count:1,workflow_runs:[{id:Number(runId),head_sha:sha,
 head_branch:'main',event:'push',run_attempt:1}]};
const fixPr={number:2416,merged:true,merge_commit_sha:'e6cf819003dec1a9b589a40129b8365e20434267'};
const oldRun={id:39556783387,conclusion:'failure',run_attempt:1,
 head_sha:'15f5fd64c5d561ed68a13637cc72a1fa8e81751b'};
describe('GLM Flash paid repair: one-shot replay and repaired dependency fence',()=>{
 it('replay, wrong old SHA, unmerged repair PR, or rerun attempt fail before any inference',()=>{
  expect(assertGlm53FlashPaidRepairAdmissionV1(env,history,fixPr,oldRun)).toEqual({runId,sha});
  expect(()=>assertGlm53FlashPaidRepairAdmissionV1(env,{...history,total_count:2},fixPr,oldRun)).toThrow();
  expect(()=>assertGlm53FlashPaidRepairAdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history,fixPr,oldRun)).toThrow();
  expect(()=>assertGlm53FlashPaidRepairAdmissionV1(env,history,{...fixPr,merged:false},oldRun)).toThrow();
  expect(()=>assertGlm53FlashPaidRepairAdmissionV1(env,history,fixPr,{...oldRun,head_sha:'b'.repeat(40)})).toThrow();
 });
 it('imports actual preflight export and points one-shot runner to the fixed dependency',()=>{
  expect(typeof getPaidGlm53FlashAdmissionV1).toBe('function');
  const src=readFileSync(new URL('../scripts/run-seyeon-openrouter-glm53flash-paid-repair-n01-v1.mjs',import.meta.url),'utf8');
  expect(src).toContain("import {getPaidGlm53FlashAdmissionV1,getOpenRouterAccountUsageV1}");
  expect(src).toContain("import {admitGlm53FlashPaidRepairOneShotV1}");
  expect(src).toContain("MODEL='z-ai/glm-5.3-flash',MAX_CALLS=3,MAX_TOKENS=1536");
  expect(src).toContain("const id='synthetic:N01',text='안녕, 세연아!'");
  expect(src).toContain('PRIOR_RESERVED_MICRO_USD=916554,OWNER_BUDGET_KRW=5000,FX_MAX=2500');
  expect(src).toContain('TIMEOUT_MS=30000,PER_CALL_RESERVE_MICRO_USD=20000');
  expect(src).toContain('providerOnlyTag:chosenProviderTag');
  expect(src).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(src).toContain('lookupOpenRouterSeyeonGenerationChargeV1');
  expect(src).toContain('actualPaymentInvoiceReconciled:false');
  expect(src).toContain('characterQualityVerified:false,productionPromotionPermitted:false');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-openrouter-glm53flash-paid-repair-three-call-n01-v1.yml',import.meta.url),'utf8');
  expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(wf).toContain('environment: production');
  expect(wf).not.toContain('workflow_dispatch:');
  expect(wf).toContain('node scripts/run-seyeon-openrouter-glm53flash-paid-repair-n01-v1.mjs');
 });
});
