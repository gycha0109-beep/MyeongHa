import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';

const key=process.env.OPENAI_API_KEY?.trim();
if(!key||key.length<20)throw Error('DIAGNOSTIC_SECRET_UNAVAILABLE');
const endpoint='https://api.openai.com/v1/models/gpt-5.6-luna';
const pickCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,60}$/.test(value)
 ? value : null;
function safeError(error){
 const causes=[error,error?.cause,...(Array.isArray(error?.errors)?error.errors:[])];
 return causes.slice(0,4).map(x=>({
  name:typeof x?.name==='string'&&/^[A-Za-z]{1,40}$/.test(x.name)?x.name:null,
  code:pickCode(x?.code),
  syscall:typeof x?.syscall==='string'&&/^[a-z]{1,32}$/.test(x.syscall)?x.syscall:null,
 }));
}
const request={method:'GET',headers:{accept:'application/json',authorization:'Bearer '+key},
 redirect:'error',signal:AbortSignal.timeout(15000)};
const start=performance.now();
let node;
try{
 const response=await fetch(endpoint,request);
 node={outcome:'http_response',httpStatus:response.status,elapsedMs:Math.round(performance.now()-start)};
 try{await response.body?.cancel();}catch{}
}catch(error){
 node={outcome:'exception',httpStatus:null,elapsedMs:Math.round(performance.now()-start),causes:safeError(error)};
}
const curl=spawnSync('curl',['--silent','--show-error','--output','/dev/null',
 '--max-time','15','--write-out','%{http_code}',endpoint],{encoding:'utf8',timeout:17000});
const curlCode=/^\d{3}$/.test((curl.stdout??'').trim())?Number(curl.stdout.trim()):null;
const result={
 scope:'READ_ONLY_NONBILLABLE_MODEL_METADATA',
 originalFailedRun:39715402328,
 model:'gpt-5.6-luna',
 modelsGetMethodOnly:true,modelGenerationPostCount:0,
 nodeVersion:process.version,
 proxyPresence:{http:!!process.env.HTTP_PROXY,https:!!process.env.HTTPS_PROXY,noProxy:!!process.env.NO_PROXY},
 node,
 unauthenticatedCurl:{status:curl.status,httpStatus:curlCode,signal:curl.signal??null},
};
console.log('SEYEON_LUNA_NONBILLABLE_TRANSPORT_DIAG '+JSON.stringify(result));
if(node.outcome!=='http_response'||node.httpStatus!==200||curl.status!==0||curlCode===null)
 process.exitCode=1;
