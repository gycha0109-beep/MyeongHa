import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';

const ACCOUNT='410d3f82ed3ccc66609a2b698803859b';
const PROJECT='cnsfpcdiyofqvhpcegfc';
const HOST='aws-0-ap-southeast-1.pooler.supabase.com';
const CA_ID='d25c14bc-d654-46b8-89cf-5c4baf931771';
const DEFAULT_PORT=6543;
const API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/hyperdrive/configs';
const ROLES=Object.freeze([
  {role:'myeongha_admin_reader',name:'myeongha-admin-reader-verifyfull-20261030'},
  {role:'myeongha_admin_audit_writer',name:'myeongha-admin-audit-verifyfull-20261030'},
]);

export function inspectDedicatedAdminHyperdriveV1(config,expected,port=DEFAULT_PORT){
  if(!config||typeof config.id!=='string'||!/^[a-f0-9]{32}$/iu.test(config.id)||
     config.name!==expected.name||config.origin?.host!==HOST||
     config.origin?.user!==expected.role+'.'+PROJECT||
     config.origin?.database!=='postgres'||config.origin?.port!==port||
     !['postgres','postgresql'].includes(config.origin?.scheme)||
     config.caching?.disabled!==true||config.mtls?.sslmode!=='verify-full'||
     config.mtls?.ca_certificate_id!==CA_ID||
     (config.integration!==undefined&&config.integration!==null))
    throw Error('Dedicated Admin Hyperdrive policy mismatch');
  return Object.freeze({role:expected.role,id:config.id,verified:true});
}

function bootstrapError(code){
  const error=new Error(code);
  error.safeCode=code;
  return error;
}

export function classifyDedicatedAdminTlsFailureV1(child){
  if(child?.error?.code==='ENOENT')return 'PSQL_EXECUTABLE_NOT_FOUND';
  if(child?.error?.code==='ETIMEDOUT')return 'PSQL_PROCESS_TIMEOUT';
  if(child?.error)return 'PSQL_PROCESS_ERROR';
  const stderr=String(child?.stderr||'').toLowerCase();
  if(/password authentication failed|invalid password|authentication failed/u.test(stderr))
    return 'DB_PASSWORD_REJECTED';
  if(/certificate verify failed|root certificate file|could not read root certificate|certificate has expired|does not match host name|self.signed certificate|ssl error/u.test(stderr))
    return 'TLS_CERTIFICATE_VALIDATION_FAILED';
  if(/could not translate host name|name or service not known|no such host/u.test(stderr))
    return 'DB_DNS_FAILURE';
  if(/connection timed out|timeout expired|operation timed out/u.test(stderr))
    return 'DB_CONNECT_TIMEOUT';
  if(/connection refused|network is unreachable|no route to host/u.test(stderr))
    return 'DB_NETWORK_UNAVAILABLE';
  if(/no pg_hba.conf entry|role .* does not exist|permission denied/u.test(stderr))
    return 'DB_ROLE_OR_POLICY_REJECTED';
  return 'DB_TLS_LOGIN_FAILED';
}

export function parseDedicatedAdminPoolerPortV1(value){
  if(value===undefined||value==='')return DEFAULT_PORT;
  if(value==='5432'||value==='6543')return Number(value);
  throw bootstrapError('POOLER_PORT_UNSUPPORTED');
}

function readHidden(label){
  if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')
    throw bootstrapError('INTERACTIVE_TERMINAL_REQUIRED');
  return new Promise((done,fail)=>{
    let secret='';
    const input=process.stdin;
    process.stderr.write(label+': ');
    function finish(error){
      input.off('data',onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
      if(error)fail(error);else done(secret);
    }
    function onData(chunk){
      for(const char of chunk){
        if(char==='\u0003'){finish(bootstrapError('INPUT_CANCELLED'));return;}
        if(char==='\r'||char==='\n'){finish();return;}
        if(char==='\u007f'||char==='\b'){secret=secret.slice(0,-1);continue;}
        if(char>=' '&&char<='~'&&secret.length<4096)secret+=char;
        else {finish(bootstrapError('UNSUPPORTED_SECRET_CHARACTER'));return;}
      }
    }
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.on('data',onData);
    input.resume();
  });
}

async function readClipboardSecret(label){
  if(!process.stdin.isTTY)throw bootstrapError('INTERACTIVE_TERMINAL_REQUIRED');
  const reader=createInterface({input:process.stdin,output:process.stderr,terminal:true});
  try{await reader.question(label+' [copy locally, then press Enter]: ');}
  finally{reader.close();}
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    "$v=Get-Clipboard -Raw; Set-Clipboard -Value ' '; if($null -ne $v){[Console]::Out.Write($v)}",
  ],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:8000,windowsHide:true,maxBuffer:8192});
  if(result.error||result.status!==0)throw bootstrapError('CLIPBOARD_UNAVAILABLE');
  return result.stdout.replace(/[\r\n]+$/u,'');
}

function checkTlsLogin(role,password,caPath,port){
  const child=spawnSync(process.env.PSQL_BIN||'psql',[
    '-X','-w','-A','-t','-h',HOST,'-p',String(port),
    '-U',role+'.'+PROJECT,'-d','postgres','-c','select current_user',
  ],{env:{...process.env,PGPASSWORD:password,PGSSLMODE:'verify-full',
        PGSSLROOTCERT:caPath,PGCONNECT_TIMEOUT:'8'},
      stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:18000,
      windowsHide:true,maxBuffer:4096});
  if(child.error||child.status!==0)
    throw bootstrapError(classifyDedicatedAdminTlsFailureV1(child));
  if(child.stdout.trim()!==role)throw bootstrapError('DB_ROLE_IDENTITY_MISMATCH');
}

async function cloudflare(token,url,method='GET',body){
  let response;
  try{
    response=await fetch(url,{method,redirect:'error',
      headers:{Authorization:'Bearer '+token,Accept:'application/json',
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  }catch{throw bootstrapError('CLOUDFLARE_REQUEST_UNAVAILABLE');}
  if(!response.ok)throw bootstrapError('CLOUDFLARE_OPERATION_DENIED');
  let data;
  try{data=await response.json();}catch{throw bootstrapError('CLOUDFLARE_RESPONSE_INVALID');}
  if(data?.success!==true)throw bootstrapError('CLOUDFLARE_OPERATION_REJECTED');
  return data.result;
}

async function main(){
  const args=process.argv.slice(2);
  if(args.some(arg=>!['--preflight-only','--clipboard'].includes(arg))||new Set(args).size!==args.length)throw bootstrapError('UNKNOWN_ARGUMENTS');
  const preflightOnly=args.includes('--preflight-only');
  const useClipboard=args.includes('--clipboard');
  const requestSecret=useClipboard?readClipboardSecret:readHidden;
  const port=parseDedicatedAdminPoolerPortV1(process.env.MYEONGHA_ADMIN_POOLER_PORT);
  const caPath=process.env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_FILE;
  if(!caPath||!existsSync(caPath))throw bootstrapError('CA_FILE_NOT_FOUND');
  const passwords=new Map();
  try{
    for(const item of ROLES){
      const password=await requestSecret(item.role+' password');
      if(password.length<24)throw bootstrapError(password.length===0?'PASSWORD_INPUT_EMPTY':'PASSWORD_INPUT_TOO_SHORT');
      checkTlsLogin(item.role,password,caPath,port);
      passwords.set(item.role,password);
      process.stderr.write(item.role+': TLS verify-full OK\n');
    }
    if(preflightOnly){
      process.stdout.write('Dedicated Admin TLS preflight passed; no Cloudflare changes.\n');
      return;
    }
    const token=process.env.CLOUDFLARE_API_TOKEN||await requestSecret('Cloudflare Hyperdrive Write API token');
    if(token.length<20)throw bootstrapError('CLOUDFLARE_TOKEN_MISSING');
    const list=await cloudflare(token,API);
    if(!Array.isArray(list))throw bootstrapError('CLOUDFLARE_INVENTORY_UNAVAILABLE');
    const results=[];
    for(const item of ROLES){
      const found=list.filter(entry=>entry.name===item.name);
      if(found.length>1)throw bootstrapError('DUPLICATE_HYPERDRIVE_NAMES');
      let entry=found[0];
      if(!entry){
        entry=await cloudflare(token,API,'POST',{
          name:item.name,
          origin:{scheme:'postgres',host:HOST,port,database:'postgres',
            user:item.role+'.'+PROJECT,password:passwords.get(item.role)},
          mtls:{sslmode:'verify-full',ca_certificate_id:CA_ID},
          caching:{disabled:true},
        });
      }
      const verified=await cloudflare(token,API+'/'+encodeURIComponent(entry.id));
      results.push(inspectDedicatedAdminHyperdriveV1(verified,item,port));
    }
    process.stdout.write(JSON.stringify({hyperdrives:results})+'\n');
  }finally{passwords.clear();}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{const code=typeof error?.safeCode==='string'?error.safeCode:'UNEXPECTED_FAILURE';process.stderr.write('Admin Hyperdrive bootstrap failed ['+code+']; no secrets printed.\n');process.exitCode=2;});
}
