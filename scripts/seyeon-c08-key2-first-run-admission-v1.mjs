/**
 * Exact-main, first-ever push-only admission for one key2-only real-model batch.
 * This is NOT a general permission to run or retry other paid workflows.
 */
import {execFileSync} from 'node:child_process';
const REPO='gycha0109-beep/MyeongHa';
const WORKFLOW='seyeon-c08-key2-first-six-real-v1.yml';
const ID=/^[1-9][0-9]*$/u, SHA=/^[a-f0-9]{40}$/u;
export function assertSeyeonC08Key2FirstRunV1(env,history,main){
 if(!env||env.GITHUB_REPOSITORY!==REPO||
    env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_RUN_ATTEMPT!=='1'||
    !ID.test(String(env.GITHUB_RUN_ID))||
    !SHA.test(String(env.GITHUB_SHA))||
    main?.object?.sha!==env.GITHUB_SHA||
    !history||history.total_count!==1||
    !Array.isArray(history.workflow_runs)||
    history.workflow_runs.length!==1)
  throw Error('C08_KEY2_SINGLE_MAIN_RUN_HOLD');
 const r=history.workflow_runs[0];
 if(String(r.id)!==String(env.GITHUB_RUN_ID)||
    r.event!=='push'||r.head_branch!=='main'||
    r.head_sha!==env.GITHUB_SHA||r.run_attempt!==1)
  throw Error('C08_KEY2_DUPLICATE_OR_STALE_RUN_HOLD');
 return Object.freeze({scope:'ONE_BOUNDED_REAL_BATCH',
  runId:String(env.GITHUB_RUN_ID),mainSha:env.GITHUB_SHA});
}
export function admitSeyeonC08Key2GithubV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('C08_KEY2_GITHUB_TOKEN_MISSING_HOLD');
 const get=url=>JSON.parse(exec('gh',['api',url],{
  encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
 }).toString());
 const history=get('repos/'+REPO+'/actions/workflows/'+WORKFLOW+
  '/runs?event=push&per_page=100');
 const main=get('repos/'+REPO+'/git/ref/heads/main');
 return assertSeyeonC08Key2FirstRunV1(env,history,main);
}
