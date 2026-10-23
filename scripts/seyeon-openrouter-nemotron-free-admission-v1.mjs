import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-nemotron-free-three-call-n01-v1.yml';
export function assertNemotronFreeOneShotAdmissionV1(env,history,previousPr,billingPr) {
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    previousPr?.number!==2382||previousPr.merged!==true||
    previousPr.merge_commit_sha!=='afd500c5f8638517ea24b430be736057c7a0aa6e'||
    billingPr?.number!==2386||billingPr.merged!==true||
    billingPr.merge_commit_sha!=='c710ad21a99d506b88269580dfd2a16222de5b84')
    throw Error('NEMOTRON_FREE_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
    throw Error('NEMOTRON_FREE_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitNemotronFreeOneShotV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('NEMOTRON_FREE_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{
  env,encoding:'utf8',timeout:15000,maxBuffer:2_000_000}));
 return assertNemotronFreeOneShotAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2382'),
  get('repos/'+REPO+'/pulls/2386'));
}
