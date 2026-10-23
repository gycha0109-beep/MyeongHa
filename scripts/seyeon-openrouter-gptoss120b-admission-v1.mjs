import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-gptoss120b-three-call-n01-v1.yml';
export function assertGptOss120bOneShotAdmissionV1(env,history,previousPr,billingPr) {
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    previousPr?.number!==2374||previousPr.merged!==true||
    previousPr.merge_commit_sha!=='fcfc66bd5390d2edee900223c40b6588a75921a2'||
    billingPr?.number!==2380||billingPr.merged!==true||
    billingPr.merge_commit_sha!=='f92a904c745b3812089b6c138dea026456d48c15')
    throw Error('GPTOSS120B_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
    throw Error('GPTOSS120B_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitGptOss120bOneShotV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('GPTOSS120B_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2_000_000}));
 return assertGptOss120bOneShotAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2374'),
  get('repos/'+REPO+'/pulls/2380'));
}
