import {execFileSync} from 'node:child_process';
import {
  N06_MAX_RESERVED_KRW,
  N06_RESERVED_MICRO_USD,
  N06_CAP500_OWNER_KRW,
} from './seyeon-terra-glm-quality-cap500-admission-v1.mjs';
import {
  SEYEON_TERRA_GLM_QUALITY_TRIO_PRIOR_RESERVED_MICRO_USD as PRIOR,
  SEYEON_TERRA_GLM_QUALITY_TRIO_LUNA_RESERVE_MICRO_USD as LUNA_RESERVE,
  SEYEON_TERRA_GLM_QUALITY_TRIO_FX_MAX as FX_MAX,
  SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_BUDGET_KRW as GLOBAL_CAP,
} from './seyeon-terra-glm-quality-trio-admission-v1.mjs';

// Existing paid one-shot is immutable and is never re-run. Admission verifies
// that precise failure, rather than interpreting another workflow's CI.
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-n06-sub500-second-one-shot-v1.yml';
const FAILED_RUN_ID=39751436405;
const FAILED_RUN_HEAD='fd335626ceeb246840d0bfc0a29157656d932892';
const FAILED_EXPERIMENT_WORKFLOW='seyeon-terra-glm-quality-cap500-v1.yml';
const CORRECTION_PR=2474;
const CORRECTION_MERGE_SHA='cc550c10104a888c39a50f4f11c2cadbbfc5ccdb';
const SHA=/^[a-f0-9]{40}$/u;

export const N06_SECOND_ONE_SHOT_MAX_RESERVE_KRW=N06_MAX_RESERVED_KRW;
export const N06_SECOND_ONE_SHOT_MAX_CALLS=6;
export const N06_SECOND_ONE_SHOT_PREVIOUS_LUNA_RESERVE_MICRO_USD=LUNA_RESERVE;

if (!(N06_SECOND_ONE_SHOT_MAX_RESERVE_KRW<N06_CAP500_OWNER_KRW) ||
  (PRIOR+LUNA_RESERVE+N06_RESERVED_MICRO_USD)*FX_MAX/1e6>GLOBAL_CAP)
  throw Error('N06_SECOND_ONE_SHOT_STATIC_BUDGET_HOLD');

export function assertN06SecondOneShotV1(env,history,failedRun,correctionPr) {
  if(env?.GITHUB_REPOSITORY!==REPO ||
     env.GITHUB_WORKFLOW_REF!==`${REPO}/.github/workflows/${WORKFLOW}@refs/heads/main` ||
     env.GITHUB_EVENT_NAME!=='push' || env.GITHUB_REF!=='refs/heads/main' ||
     env.GITHUB_RUN_ATTEMPT!=='1' || !SHA.test(env.GITHUB_SHA??'') ||
     !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'') ||
     history?.total_count!==1 || !Array.isArray(history.workflow_runs) ||
     history.workflow_runs.length!==1)
    throw Error('N06_SECOND_ONE_SHOT_ADMISSION_HOLD');
  const run=history.workflow_runs[0];
  if(String(run.id)!==env.GITHUB_RUN_ID ||
     run.head_sha!==env.GITHUB_SHA ||
     run.event!=='push' || run.head_branch!=='main' ||
     run.run_attempt!==1)
    throw Error('N06_SECOND_ONE_SHOT_DUPLICATE_OR_RETRY_HOLD');
  if(failedRun?.id!==FAILED_RUN_ID ||
     failedRun?.head_sha!==FAILED_RUN_HEAD ||
     failedRun?.status!=='completed' || failedRun?.conclusion!=='failure' ||
     failedRun?.run_attempt!==1 || failedRun?.event!=='push' ||
     failedRun?.path!==`gycha0109-beep/MyeongHa/.github/workflows/${FAILED_EXPERIMENT_WORKFLOW}@refs/heads/main` ||
     correctionPr?.number!==CORRECTION_PR ||
     correctionPr?.merged!==true ||
     correctionPr?.merge_commit_sha!==CORRECTION_MERGE_SHA)
    throw Error('N06_SECOND_ONE_SHOT_PREDECESSOR_HOLD');
  return Object.freeze({runId:env.GITHUB_RUN_ID,mainSha:env.GITHUB_SHA});
}

export function admitN06SecondOneShotV1(env=process.env,exec=execFileSync){
  if(!env.GH_TOKEN)throw Error('N06_SECOND_ONE_SHOT_GITHUB_AUTH_HOLD');
  const read=path=>JSON.parse(exec('gh',['api',path],{
    env,encoding:'utf8',timeout:15000,maxBuffer:2000000,
  }));
  return assertN06SecondOneShotV1(env,
    read(`repos/${REPO}/actions/workflows/${WORKFLOW}/runs?event=push&per_page=100`),
    read(`repos/${REPO}/actions/runs/${FAILED_RUN_ID}`),
    read(`repos/${REPO}/pulls/${CORRECTION_PR}`),
  );
}
