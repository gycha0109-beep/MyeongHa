import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-glm53flash-paid-repair-three-call-n01-v1.yml';
export function assertGlm53FlashPaidRepairAdmissionV1(env,history,fixPr,failedRun) {
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    fixPr?.number!==2416||fixPr.merged!==true||
    fixPr.merge_commit_sha!=='e6cf819003dec1a9b589a40129b8365e20434267'||
    failedRun?.id!==39556783387||failedRun?.conclusion!=='failure'||
    failedRun?.run_attempt!==1||
    failedRun?.head_sha!=='15f5fd64c5d561ed68a13637cc72a1fa8e81751b')
    throw Error('GLM53FLASH_PAID_REPAIR_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
    throw Error('GLM53FLASH_PAID_REPAIR_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitGlm53FlashPaidRepairOneShotV1(env=process.env,exec=execFileSync) {
 if(!env.GH_TOKEN)throw Error('GLM53FLASH_PAID_REPAIR_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2_000_000}));
 return assertGlm53FlashPaidRepairAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2416'),
  get('repos/'+REPO+'/actions/runs/39556783387'));
}
