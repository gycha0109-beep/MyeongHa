import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa', WORKFLOW='seyeon-live-dialogue-key2-first-pair-recovery-v2.yml';
const SHA=/^[a-f0-9]{40}$/u, ID=/^[1-9][0-9]*$/u;
export function assertSeyeonLiveDialoguePairRecoveryV2(env,history,previous){
 if(env?.GITHUB_REPOSITORY!==REPO||env?.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !SHA.test(env.GITHUB_SHA??'')||!ID.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1)
  throw Error('SEYEON_LIVE_PAIR_RECOVERY_ONE_TIME_HOLD');
 const r=history.workflow_runs[0];
 if(String(r.id)!==env.GITHUB_RUN_ID||r.head_sha!==env.GITHUB_SHA||
    r.event!=='push'||r.head_branch!=='main'||r.run_attempt!==1)
  throw Error('SEYEON_LIVE_PAIR_RECOVERY_DUPLICATE_HOLD');
 // The previous attempt failed parsing before the first reservation or POST.
 if(previous?.id!==39225780485||previous.head_sha!=='118ff5de5b913bcda8d147ebe325436bdb4b1ed3'||
    previous.status!=='completed'||previous.conclusion!=='failure'||
    previous.run_attempt!==1)
  throw Error('SEYEON_LIVE_PAIR_PREVIOUS_FAILURE_CHANGED_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,mainSha:env.GITHUB_SHA});
}
export function admitSeyeonLiveDialoguePairRecoveryV2(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('SEYEON_LIVE_PAIR_NO_ACTIONS_TOKEN_HOLD');
 const get=url=>JSON.parse(exec('gh',['api',url],{
  encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
 }).toString());
 const history=get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+
  '/runs?event=push&per_page=100');
 const previous=get('repos/'+REPO+'/actions/runs/39225780485');
 return assertSeyeonLiveDialoguePairRecoveryV2(env,history,previous);
}
