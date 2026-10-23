import{execFileSync}from'node:child_process';
const REPO='gycha0109-beep/MyeongHa',WF='seyeon-openrouter-three-call-n01-v1.yml';
export function checkAdmission(env,h,a,b){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||h?.total_count!==1||h.workflow_runs?.length!==1||
 a?.number!==2366||a.merged!==true||a.merge_commit_sha!=='30aeef27bc59a8044db203abdba3ef0a3df84c31'||
 b?.number!==2369||b.merged!==true||b.merge_commit_sha!=='1feaa6a8c8300024b32fa2787614896051397280')throw Error('OPENROUTER_ADMISSION_HOLD');
 const x=h.workflow_runs[0];
 if(x.event!=='push'||x.head_branch!=='main'||x.head_sha!==env.GITHUB_SHA||x.run_attempt!==1||String(x.id)!==env.GITHUB_RUN_ID)throw Error('OPENROUTER_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
export function admit(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('NO_GH_TOKEN_HOLD');
 const get=p=>JSON.parse(exec('gh',['api',p],{encoding:'utf8',timeout:15000,maxBuffer:2000000,env}));
 return checkAdmission(env,get('repos/'+REPO+'/actions/workflows/'+WF+'/runs?event=push&per_page=100'),get('repos/'+REPO+'/pulls/2366'),get('repos/'+REPO+'/pulls/2369'));
}
