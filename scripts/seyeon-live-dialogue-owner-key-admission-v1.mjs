/**
 * User-approved one-off public synthetic Se-yeon N01 5-vs-3 model test
 * using the repository's existing OPENAI_API_KEY.
 * No Production chat dispatch or retry; moving main SHA is irrelevant.
 */
import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa',WORKFLOW='seyeon-live-dialogue-owner-key-first-pair-v1.yml';
const SHA=/^[a-f0-9]{40}$/u,ID=/^[1-9][0-9]*$/u;
const PREVIOUS_RUN=39350184578;
const PREVIOUS_SHA='f839491e6f4e33eccd9511040ae858b91a881e6f';
export function assertSeyeonLiveDialogueOwnerKeyV1(env,history,previous){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !SHA.test(env.GITHUB_SHA??'')||!ID.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1)
   throw Error('SEYEON_OWNER_KEY_ONE_TIME_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==env.GITHUB_RUN_ID||run.head_sha!==env.GITHUB_SHA||
    run.event!=='push'||run.head_branch!=='main'||run.run_attempt!==1)
   throw Error('SEYEON_OWNER_KEY_DUPLICATE_OR_STALE_RUN_HOLD');
 if(previous?.id!==PREVIOUS_RUN||previous.head_sha!==PREVIOUS_SHA||
    previous.status!=='completed'||previous.conclusion!=='failure'||
    previous.run_attempt!==1)
   throw Error('SEYEON_OWNER_KEY_PREVIOUS_401_EVIDENCE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,mainSha:env.GITHUB_SHA});
}
export function admitSeyeonLiveDialogueOwnerKeyV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('SEYEON_OWNER_KEY_GITHUB_TOKEN_MISSING_HOLD');
 const get=url=>JSON.parse(exec('gh',['api',url],{
  encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
 }).toString());
 const history=get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100');
 const previous=get('repos/'+REPO+'/actions/runs/'+PREVIOUS_RUN);
 return assertSeyeonLiveDialogueOwnerKeyV1(env,history,previous);
}
