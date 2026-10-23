/**
 * GitHub Actions one-shot approval for the C07 six-request pilot.
 * Never accepts a second workflow_dispatch or GITHUB_RUN_ATTEMPT > 1.
 * A GitHub API outage or changed history is an unconditional HOLD.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const numeric=/^[1-9][0-9]*$/u;
export function assertSeyeonC07UniqueDispatchV1(data,runId,attempt){
 if(!numeric.test(String(runId))||
    String(attempt)!=='1'||
    !data||data.total_count!==1||
    !Array.isArray(data.workflow_runs)||
    data.workflow_runs.length!==1||
    String(data.workflow_runs[0].id)!==String(runId)||
    data.workflow_runs[0].event!=='workflow_dispatch'||
    data.workflow_runs[0].head_branch!=='main'||
    data.workflow_runs[0].run_attempt!==1)
  throw Error('C07 manual pilot duplicate/uncertain GitHub run HOLD');
 return Object.freeze({
  approvedFirstRunId:String(runId),runAttempt:1,
  providerCallsAuthorizedByThisFunction:0,
 });
}

export function admitSeyeonC07GitHubRunV1(){
 const runId=process.env.GITHUB_RUN_ID;
 const attempt=process.env.GITHUB_RUN_ATTEMPT;
 if(process.env.GITHUB_REPOSITORY!=='gycha0109-beep/MyeongHa'||
   process.env.GITHUB_REF!=='refs/heads/main'||
   process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
   !process.env.GH_TOKEN||
   !numeric.test(String(runId))||
   String(attempt)!=='1')
  throw Error('C07 manual pilot not in a single first-run main context');
 const response=execFileSync('gh',[
  'api',
  'repos/gycha0109-beep/MyeongHa/actions/workflows/seyeon-c07-six-call-model-eval-v1.yml/runs?event=workflow_dispatch&per_page=100',
 ],{encoding:'utf8',timeout:15000,maxBuffer:2000000});
 return assertSeyeonC07UniqueDispatchV1(JSON.parse(response),runId,attempt);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 process.stdout.write(admitSeyeonC07GitHubRunV1().approvedFirstRunId+'\n');
