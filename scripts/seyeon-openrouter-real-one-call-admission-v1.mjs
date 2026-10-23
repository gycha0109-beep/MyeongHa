import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-openrouter-real-one-call-v1.yml';
const REVIEWED_MERGE='30aeef27bc59a8044db203abdba3ef0a3df84c31';
export function assertOpenRouterOneCallAdmissionV1(env,history,pr) {
 if(env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main' ||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1||
    pr?.number!==2366||pr.merged!==true||
    pr.merge_commit_sha!==REVIEWED_MERGE)
  throw Error('OPENROUTER_REAL_PROBE_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
  throw Error('OPENROUTER_REAL_PROBE_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admitOpenRouterOneCallV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('OPENROUTER_REAL_PROBE_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{env,encoding:'utf8',
  timeout:15000,maxBuffer:2000000}).toString());
 return assertOpenRouterOneCallAdmissionV1(env,
  get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'),
  get('repos/'+REPO+'/pulls/2366'));
}
