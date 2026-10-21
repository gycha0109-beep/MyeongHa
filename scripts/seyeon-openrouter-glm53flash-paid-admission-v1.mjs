import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-glm53flash-paid-three-call-n01-v1.yml';
export function assertGlm53FlashPaidOneShotAdmissionV1(env,history,previousPr,billingPr) {
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    previousPr?.number!==2410||previousPr.merged!==true||
    previousPr.merge_commit_sha!=='bc8c0889c10a1fa515037449682a75795c67a04e'||
    billingPr?.number!==2390||billingPr.merged!==true||
    billingPr.merge_commit_sha!=='83cdd2db8a836c7c6941beb5c815e3e116ec1663')
    throw Error('GLM53FLASH_PAID_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
    throw Error('GLM53FLASH_PAID_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitGlm53FlashPaidOneShotV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('GLM53FLASH_PAID_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2_000_000}));
 return assertGlm53FlashPaidOneShotAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2410'),
  get('repos/'+REPO+'/pulls/2390'));
}
