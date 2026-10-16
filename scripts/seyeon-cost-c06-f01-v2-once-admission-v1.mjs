/**
 * One-time GitHub Actions manual dispatch guard. No provider requests.
 * Concurrency in workflow prevents two simultaneous passing admissions.
 */
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function assertF01V2SingleDispatch(data,runId){
 if(!/^[1-9][0-9]*$/u.test(String(runId))||
  !data||data.total_count!==1||
  !Array.isArray(data.workflow_runs)||data.workflow_runs.length!==1||
  String(data.workflow_runs[0].id)!==String(runId)||
  data.workflow_runs[0].event!=='workflow_dispatch'||
  data.workflow_runs[0].head_branch!=='main')
  throw Error('C06 F01 V2 repeat dispatch or unverified Actions history');
 return Object.freeze({runId:String(runId),approved:true});
}
export function checkF01V2GitHubAdmission(){
 const id=process.env.GITHUB_RUN_ID;
 if(process.env.GITHUB_RUN_ATTEMPT!=='1')
  throw Error('C06 F01 V2 rerun attempt denied');
 if(!process.env.GH_TOKEN||
   process.env.GITHUB_REPOSITORY!=='gycha0109-beep/MyeongHa'||
   process.env.GITHUB_REF!=='refs/heads/main')
  throw Error('C06 F01 V2 GitHub context missing');
 const data=JSON.parse(execFileSync('gh',[
  'api',
  'repos/gycha0109-beep/MyeongHa/actions/workflows/seyeon-c06-f01-v2-manual-eval.yml/runs?event=workflow_dispatch&per_page=100',
 ],{encoding:'utf8',timeout:15000,maxBuffer:2000000}));
 return assertF01V2SingleDispatch(data,id);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 process.stdout.write(checkF01V2GitHubAdmission().runId+'\n');
