import {execFileSync} from 'node:child_process';

const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-terra-glm-quality-trio-one-shot-v1.yml';
const sha=/^[a-f0-9]{40}$/u;
const runId=/^[1-9][0-9]*$/u;
const BASELINE_SHA='d169ac46fcd67cc225ac7adc8f5c1d6b4f9941de';
const GLM_SHA='1715c4968f56391c05df160984a396501b8be151';

export const SEYEON_TERRA_GLM_QUALITY_TRIO_PRIOR_RESERVED_MICRO_USD=976554;
export const SEYEON_TERRA_GLM_QUALITY_TRIO_TERRA_RESERVE_MICRO_USD=50000;
export const SEYEON_TERRA_GLM_QUALITY_TRIO_GLM_RESERVE_MICRO_USD=20000;
export const SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_BUDGET_KRW=5000;
export const SEYEON_TERRA_GLM_QUALITY_TRIO_FX_MAX=2500;
export const SEYEON_TERRA_GLM_QUALITY_TRIO_MAX_CALLS=8;

export function assertTerraGlmQualityTrioOneShotV1(env,history,terraPr,terraRun,glmPr,glmRun){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !sha.test(env.GITHUB_SHA??'')||!runId.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    terraPr?.number!==2355||terraPr.merged!==true||
    terraPr.merge_commit_sha!==BASELINE_SHA||
    glmPr?.number!==2418||glmPr.merged!==true||
    glmPr.merge_commit_sha!==GLM_SHA||
    terraRun?.id!==39352712484||terraRun.status!=='completed'||
    terraRun.conclusion!=='success'||terraRun.run_attempt!==1||
    glmRun?.id!==39560101607||glmRun.status!=='completed'||
    glmRun.conclusion!=='success'||glmRun.run_attempt!==1||
    glmRun.head_sha!==GLM_SHA)
  throw Error('TERRA_GLM_QUALITY_TRIO_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
  throw Error('TERRA_GLM_QUALITY_TRIO_DUPLICATE_OR_RETRY_HOLD');
 if((SEYEON_TERRA_GLM_QUALITY_TRIO_PRIOR_RESERVED_MICRO_USD+
      15*SEYEON_TERRA_GLM_QUALITY_TRIO_TERRA_RESERVE_MICRO_USD+
      9*SEYEON_TERRA_GLM_QUALITY_TRIO_GLM_RESERVE_MICRO_USD)*
      SEYEON_TERRA_GLM_QUALITY_TRIO_FX_MAX/1e6>
      SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_BUDGET_KRW)
   throw Error('TERRA_GLM_QUALITY_TRIO_OWNER_BUDGET_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,mainSha:env.GITHUB_SHA});
}

export function admitTerraGlmQualityTrioOneShotV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('TERRA_GLM_QUALITY_TRIO_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2000000,
 }));
 return assertTerraGlmQualityTrioOneShotV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2355'),
  get('repos/'+REPO+'/actions/runs/39352712484'),
  get('repos/'+REPO+'/pulls/2418'),
  get('repos/'+REPO+'/actions/runs/39560101607'));
}

// This explicitly accepts only guarded public synthetic N01. Not a general
// user-message or character-content release primitive.
export function requirePublicSyntheticQualityUtteranceV1(envelope){
 if(envelope?.revealLevel!=='public'||!Array.isArray(envelope.memoryRefsMentioned)||
    envelope.memoryRefsMentioned.length!==0||
    !Array.isArray(envelope.privateSourceRefsMentioned)||
    envelope.privateSourceRefsMentioned.length!==0||
    !Array.isArray(envelope.disclosureSliceIds)||
    envelope.disclosureSliceIds.length!==0||
    typeof envelope.utterance!=='string'||
    envelope.utterance.trim()!==envelope.utterance||
    envelope.utterance.length<1||envelope.utterance.length>500||
    !/[가-힣]/u.test(envelope.utterance)||
    /[\u0000-\u001f\u007f]/u.test(envelope.utterance))
  throw Error('TERRA_GLM_QUALITY_TRIO_OUTPUT_GUARD_HOLD');
 return envelope.utterance;
}
