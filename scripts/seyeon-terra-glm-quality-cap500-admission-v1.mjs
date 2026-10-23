import {execFileSync} from 'node:child_process';
import {
  SEYEON_TERRA_GLM_QUALITY_TRIO_PRIOR_RESERVED_MICRO_USD as PRIOR,
  SEYEON_TERRA_GLM_QUALITY_TRIO_LUNA_RESERVE_MICRO_USD as LUNA,
  SEYEON_TERRA_GLM_QUALITY_TRIO_GLM_RESERVE_MICRO_USD as GLM,
  SEYEON_TERRA_GLM_QUALITY_TRIO_FX_MAX as FX_MAX,
  SEYEON_TERRA_GLM_QUALITY_TRIO_OWNER_BUDGET_KRW as GLOBAL_CAP,
} from './seyeon-terra-glm-quality-trio-admission-v1.mjs';
import {SEYEON_DIALOGUE_PATH_PRICES_V1}
  from './seyeon-dialogue-path-eval-core-v1.mjs';
import {MAX_INPUT_USD_PER_M as GLM_INPUT_PRICE,
  MAX_OUTPUT_USD_PER_M as GLM_OUTPUT_PRICE}
  from './seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';

const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-terra-glm-quality-cap500-v1.yml';
const SHA=/^[a-f0-9]{40}$/u;
export const N06_CAP500_OWNER_KRW=500;
export const N06_MAX_REQUEST_BODY_BYTES=19200;
export const N06_ORIGINAL_FAILED_REQUEST_BODY_CAP=15680;
export const N06_MAX_OUTPUT_TOKENS=1536;
export const N06_MAX_CALLS=6;
// This budget belongs ONLY to a future N06 experiment, not legacy trials.
export const N06_TERRA_RESERVE_MICRO_USD=57000;
const TERRA=N06_TERRA_RESERVE_MICRO_USD;
export const N06_RESERVED_MICRO_USD=LUNA+2*TERRA+3*GLM;
export const N06_MAX_RESERVED_KRW=N06_RESERVED_MICRO_USD*FX_MAX/1e6;
// Worst case: uncompressed request byte count bounds token count.
// Assume no cache discount; preserve maximum output tokens and per-route prices.
const lunaRates=SEYEON_DIALOGUE_PATH_PRICES_V1['gpt-5.6-luna'];
const terraRates=SEYEON_DIALOGUE_PATH_PRICES_V1['gpt-5.6-terra'];
export const N06_TERRA_WORST_CASE_MICRO_USD=Math.ceil(
  N06_MAX_REQUEST_BODY_BYTES*terraRates.input+
  N06_MAX_OUTPUT_TOKENS*terraRates.output,
);
const lunaWorstCaseMicroUsd=Math.ceil(
  N06_MAX_REQUEST_BODY_BYTES*lunaRates.input+
  N06_MAX_OUTPUT_TOKENS*lunaRates.output,
);
const glmWorstCaseMicroUsd=Math.ceil(
  N06_MAX_REQUEST_BODY_BYTES*GLM_INPUT_PRICE+
  N06_MAX_OUTPUT_TOKENS*GLM_OUTPUT_PRICE,
);
if (N06_TERRA_WORST_CASE_MICRO_USD>TERRA ||
    lunaWorstCaseMicroUsd>LUNA||glmWorstCaseMicroUsd>GLM)
  throw Error('N06_CAP500_RATE_AND_REQUEST_BOUND_HOLD');

if(!(N06_MAX_RESERVED_KRW<N06_CAP500_OWNER_KRW) ||
   (PRIOR+N06_RESERVED_MICRO_USD)*FX_MAX/1e6>GLOBAL_CAP)
  throw Error('N06_CAP500_STATIC_BUDGET_HOLD');

export function assertN06Cap500ReservationV1(reserved, next, route, bytes, maxOutput=1536) {
  if(!reserved || !['luna','terra','glm'].includes(route) ||
     !Number.isSafeInteger(next)||next<1||
     !Number.isSafeInteger(bytes)||bytes<1||bytes>N06_MAX_REQUEST_BODY_BYTES||
     maxOutput!==N06_MAX_OUTPUT_TOKENS)
    throw Error('N06_CAP500_REQUEST_BOUND_HOLD');
  const counts={luna:reserved.luna,terra:reserved.terra,glm:reserved.glm};
  if(Object.values(counts).some(v=>!Number.isSafeInteger(v)||v<0)||
     counts.luna>1||counts.terra>2||counts.glm>3)
    throw Error('N06_CAP500_CALL_TOPOLOGY_HOLD');
  if((route==='luna'&&counts.luna>=1)||
     (route==='terra'&&counts.terra>=2)||
     (route==='glm'&&counts.glm>=3)||
     next!=={luna:LUNA,terra:TERRA,glm:GLM}[route])
    throw Error('N06_CAP500_CALL_TOPOLOGY_HOLD');
  const current=counts.luna*LUNA+counts.terra*TERRA+counts.glm*GLM;
  const after=current+next;
  if(after*FX_MAX/1e6>=N06_CAP500_OWNER_KRW||
     (PRIOR+after)*FX_MAX/1e6>GLOBAL_CAP)
    throw Error('N06_CAP500_BUDGET_HOLD');
  return Object.freeze({reservedMicroUsd:after,
    reserveUpperKrw:Number((after*FX_MAX/1e6).toFixed(3)),
    cumulativePriorReserveUpperKrw:Number(((PRIOR+after)*FX_MAX/1e6).toFixed(3))});
}

export function assertN06Cap500OneShotV1(env,history) {
  if(env?.GITHUB_REPOSITORY!==REPO||
     env.GITHUB_WORKFLOW_REF!==`${REPO}/.github/workflows/${WORKFLOW}@refs/heads/main`||
     env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_RUN_ATTEMPT!=='1'||!SHA.test(env.GITHUB_SHA??'')||
     !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
     history?.total_count!==1||!Array.isArray(history.workflow_runs)||
     history.workflow_runs.length!==1)
    throw Error('N06_CAP500_ONE_SHOT_ADMISSION_HOLD');
  const run=history.workflow_runs[0];
  if(String(run.id)!==env.GITHUB_RUN_ID||
     run.head_sha!==env.GITHUB_SHA||run.event!=='push'||
     run.head_branch!=='main'||run.run_attempt!==1)
    throw Error('N06_CAP500_DUPLICATE_OR_RETRY_HOLD');
  return Object.freeze({runId:env.GITHUB_RUN_ID,mainSha:env.GITHUB_SHA});
}

export function admitN06Cap500OneShotV1(env=process.env,exec=execFileSync) {
  if(!env.GH_TOKEN)throw Error('N06_CAP500_GITHUB_AUTH_HOLD');
  const history=JSON.parse(exec('gh',[
    'api',`repos/${REPO}/actions/workflows/${WORKFLOW}/runs?event=push&per_page=100`
  ],{env,encoding:'utf8',timeout:15000,maxBuffer:2000000}));
  return assertN06Cap500OneShotV1(env,history);
}
