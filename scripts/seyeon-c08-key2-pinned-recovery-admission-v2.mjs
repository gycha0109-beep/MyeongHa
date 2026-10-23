/**
 * Single-use recovery for the 2026-10-19 zero-dispatch main-race failure.
 * Trust the triggering GitHub push commit, not the moving main branch tip.
 * Fail closed on rerun, a second recovery run, or changed historical failure.
 */
import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-c08-key2-pinned-recovery-real-v2.yml';
const OLD_RUN=39217368031;
const OLD_SHA='27c3ed3b28baba2052ecae8aa6a4fc487589f2ee';
const ID=/^[1-9][0-9]*$/u,SHA=/^[a-f0-9]{40}$/u;
export function assertSeyeonC08Key2PinnedRecoveryV2(env,history,previous){
 if(!env||env.GITHUB_REPOSITORY!==REPO||
    env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_RUN_ATTEMPT!=='1'||
    !ID.test(String(env.GITHUB_RUN_ID))||
    !SHA.test(String(env.GITHUB_SHA))||
    !history||history.total_count!==1||
    !Array.isArray(history.workflow_runs)||
    history.workflow_runs.length!==1)
  throw Error('C08_KEY2_PINNED_RECOVERY_ADMISSION_HOLD');
 const run=history.workflow_runs[0];
 if(String(run.id)!==String(env.GITHUB_RUN_ID)||
    run.event!=='push'||run.head_branch!=='main'||
    run.head_sha!==env.GITHUB_SHA||run.run_attempt!==1)
  throw Error('C08_KEY2_PINNED_RECOVERY_DUPLICATE_HOLD');
 // Historical run was audited: admission failed before provider creation,
 // so zero requests were dispatched; its immutable identity must still match.
 if(previous?.id!==OLD_RUN||previous?.head_sha!==OLD_SHA||
    previous?.status!=='completed'||previous?.conclusion!=='failure'||
    previous?.event!=='push'||previous?.head_branch!=='main'||
    previous?.run_attempt!==1)
  throw Error('C08_KEY2_PREVIOUS_FAILURE_CHANGED_HOLD');
 return Object.freeze({scope:'ONE_BOUNDED_REAL_BATCH',
  runId:String(env.GITHUB_RUN_ID),mainSha:env.GITHUB_SHA});
}
export function admitSeyeonC08Key2PinnedGithubV2(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('C08_KEY2_GITHUB_TOKEN_MISSING_HOLD');
 const get=url=>JSON.parse(exec('gh',['api',url],{
  encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
 }).toString());
 const history=get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+
  '/runs?event=push&per_page=100');
 const previous=get('repos/'+REPO+'/actions/runs/'+OLD_RUN);
 return assertSeyeonC08Key2PinnedRecoveryV2(env,history,previous);
}
