import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-three-call-first-turn-v1.yml';
const PREVIOUS_RUN=39366717049;
const PREVIOUS_SHA='1feaa6a8c8300024b32fa2787614896051397280';
export function assertOpenRouterThreeCallAdmissionV1(env,history,previous,pr){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_EVENT_NAME!=='push'||
   env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_RUN_ATTEMPT!=='1'||
   !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??'')||
   !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
   history?.total_count!==1||history.workflow_runs?.length!==1||
   previous?.id!==PREVIOUS_RUN||previous?.head_sha!==PREVIOUS_SHA||
   previous?.status!=='completed'||previous?.conclusion!=='success'||
   previous?.run_attempt!==1||pr?.number!==2369||
   pr?.merged!==true||pr?.merge_commit_sha!==PREVIOUS_SHA)
  throw Error('OPENROUTER_THREE_CALL_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
   run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
  throw Error('OPENROUTER_THREE_CALL_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitOpenRouterThreeCallV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('OPENROUTER_THREE_CALL_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2000000,
 }).toString());
 return assertOpenRouterThreeCallAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/actions/runs/'+PREVIOUS_RUN),
  get('repos/'+REPO+'/pulls/2369'));
}
