import {spawnSync} from 'node:child_process';

const REPO='gycha0109-beep/MyeongHa';
const ENV='Production';
const PROJECT='cnsfpcdiyofqvhpcegfc';
const HOST='aws-0-ap-southeast-1.pooler.supabase.com';
const PREFIX='MYEONGHA_ADMIN_';
const REQUIRED=[
  {name:PREFIX+'OWNER_EMAIL',prompt:'Owner email copied to clipboard',check:v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)},
  {name:PREFIX+'OWNER_AUTH_USER_ID',prompt:'Supabase Owner auth.users ID copied to clipboard',check:v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)},
  {name:PREFIX+'SUPABASE_PUBLISHABLE_KEY',prompt:'Supabase publishable or anon key copied to clipboard',check:v=>v.length>=20&&!v.startsWith('sb_secret_')},
  {name:PREFIX+'READ_DATABASE_URL',prompt:'Reader database password copied to clipboard',role:'myeongha_admin_reader',check:v=>/^[\x20-\x7e]{24,4096}$/.test(v)},
  {name:PREFIX+'AUDIT_DATABASE_URL',prompt:'Audit Writer database password copied to clipboard',role:'myeongha_admin_audit_writer',check:v=>/^[\x20-\x7e]{24,4096}$/.test(v)},
  {name:PREFIX+'CLOUDFLARE_API_TOKEN',prompt:'Dedicated Admin Worker deploy token copied to clipboard (NOT Hyperdrive-only token)',check:v=>/^[A-Za-z0-9_-]{30,512}$/.test(v)}
];

function safeRun(args,input){
  const result=spawnSync('gh.exe',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,windowsHide:true,maxBuffer:65536});
  if(result.error||result.status!==0)throw Error('GITHUB_OPERATION_FAILED');
  return result.stdout;
}
function readClipboard(){
  const cmd="$v=Get-Clipboard -Raw; Set-Clipboard -Value ' '; if($null -ne $v){[Console]::Out.Write($v)}";
  const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:8000,windowsHide:true,maxBuffer:10000});
  if(p.error||p.status!==0)throw Error('CLIPBOARD_UNAVAILABLE');
  return p.stdout.replace(/[\r\n]+$/u,'');
}
function listPresent(){
  const raw=safeRun(['api',`repos/${REPO}/environments/${ENV}/secrets`]);
  const data=JSON.parse(raw);
  return new Set((data.secrets||[]).map(s=>s.name));
}
function put(name,value){safeRun(['secret','set',name,'--repo',REPO,'--env',ENV],value);}
function waitForEnterOnly(label){
  if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  return new Promise((resolve,reject)=>{
    const input=process.stdin;
    process.stderr.write(label+' [Enter only; never paste into terminal]: ');
    const done=error=>{
      input.off('data',onData);input.setRawMode(false);input.pause();process.stderr.write('\n');
      if(error)reject(error);else resolve();
    };
    const onData=chunk=>{for(const char of chunk){if(char==='\r'||char==='\n'){done();return;}done(Error(char==='\u0003'?'INPUT_CANCELLED':'TERMINAL_INPUT_NOT_ALLOWED'));return;}};
    input.setEncoding('utf8');input.setRawMode(true);input.on('data',onData);input.resume();
  });
}
try{
  if(!process.stdin.isTTY)throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  const present=listPresent();
  console.log('Admin Worker stage setup: only missing secrets are requested; do not paste in terminal.');
  for(const item of REQUIRED){
    if(present.has(item.name)){console.log('ALREADY_SET '+item.name);continue;}
    await waitForEnterOnly(item.prompt);
    let value=readClipboard();
    if(!item.check(value))throw Error('INVALID_INPUT_FOR_'+item.name);
    if(item.role){
      value='postgresql://'+encodeURIComponent(item.role+'.'+PROJECT)+':'+encodeURIComponent(value)+'@'+HOST+':6543/postgres?sslmode=verify-full';
    }
    put(item.name,value);
    value='';
    present.add(item.name);
    console.log('REGISTERED '+item.name);
  }
  const missing=REQUIRED.filter(x=>!present.has(x.name)).map(x=>x.name);
  console.log(missing.length?'MISSING '+missing.join(','):'ADMIN_STAGE_CREDENTIALS_REGISTERED');
}catch(error){console.error('ADMIN_STAGE_SETUP_STOPPED '+String(error?.message||'UNKNOWN').replace(/[^a-zA-Z0-9_]/g,'').slice(0,100));process.exitCode=2;}
