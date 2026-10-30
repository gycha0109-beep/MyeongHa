import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ACCOUNT='410d3f82ed3ccc66609a2b698803859b';
const PROJECT='cnsfpcdiyofqvhpcegfc';
const HOST='aws-0-ap-southeast-1.pooler.supabase.com';
const CA_ID='d25c14bc-d654-46b8-89cf-5c4baf931771';
const API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/hyperdrive/configs';
const ROLES=Object.freeze([
  {role:'myeongha_admin_reader',name:'myeongha-admin-reader-verifyfull-20261030'},
  {role:'myeongha_admin_audit_writer',name:'myeongha-admin-audit-verifyfull-20261030'},
]);

export function inspectDedicatedAdminHyperdriveV1(config,expected){
  if(!config||typeof config.id!=='string'||!/^[a-f0-9]{32}$/iu.test(config.id)||
     config.name!==expected.name||config.origin?.host!==HOST||
     config.origin?.user!==expected.role+'.'+PROJECT||
     config.origin?.database!=='postgres'||config.origin?.port!==5432||
     !['postgres','postgresql'].includes(config.origin?.scheme)||
     config.caching?.disabled!==true||config.mtls?.sslmode!=='verify-full'||
     config.mtls?.ca_certificate_id!==CA_ID||
     (config.integration!==undefined&&config.integration!==null))
    throw Error('Dedicated Admin Hyperdrive policy mismatch');
  return Object.freeze({role:expected.role,id:config.id,verified:true});
}

function readHidden(label){
  if(!process.stdin.isTTY||typeof process.stdin.setRawMode!=='function')
    throw Error('An interactive local terminal is required');
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
        if(char==='\u0003'){finish(Error('Cancelled'));return;}
        if(char==='\r'||char==='\n'){finish();return;}
        if(char==='\u007f'||char==='\b'){secret=secret.slice(0,-1);continue;}
        if(char>=' '&&char<='~'&&secret.length<4096)secret+=char;
        else {finish(Error('Unsupported password input character'));return;}
      }
    }
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.on('data',onData);
    input.resume();
  });
}

function checkTlsLogin(role,password,caPath){
  const child=spawnSync(process.env.PSQL_BIN||'psql',[
    '-X','-w','-A','-t','-h',HOST,'-p','5432',
    '-U',role+'.'+PROJECT,'-d','postgres','-c','select current_user',
  ],{env:{...process.env,PGPASSWORD:password,PGSSLMODE:'verify-full',
        PGSSLROOTCERT:caPath,PGCONNECT_TIMEOUT:'8'},
      stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:18000,
      windowsHide:true,maxBuffer:4096});
  if(child.error||child.status!==0||child.stdout.trim()!==role)
    throw Error('Dedicated role TLS verify-full login failed: '+role);
}

async function cloudflare(token,url,method='GET',body){
  let response;
  try{
    response=await fetch(url,{method,redirect:'error',
      headers:{Authorization:'Bearer '+token,Accept:'application/json',
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  }catch{throw Error('Cloudflare request unavailable');}
  if(!response.ok)throw Error('Cloudflare Hyperdrive operation denied');
  let data;
  try{data=await response.json();}catch{throw Error('Invalid Cloudflare response');}
  if(data?.success!==true)throw Error('Cloudflare Hyperdrive operation rejected');
  return data.result;
}

async function main(){
  const preflightOnly=process.argv.length===3&&process.argv[2]==='--preflight-only';
  if(process.argv.length>2&&!preflightOnly)throw Error('Unknown arguments');
  const caPath=process.env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_FILE;
  if(!caPath||!existsSync(caPath))throw Error('Dedicated Supabase CA file is required');
  const passwords=new Map();
  try{
    for(const item of ROLES){
      const password=await readHidden(item.role+' password');
      if(password.length<24)throw Error('Dedicated role password too short');
      checkTlsLogin(item.role,password,caPath);
      passwords.set(item.role,password);
      process.stderr.write(item.role+': TLS verify-full OK\n');
    }
    if(preflightOnly){
      process.stdout.write('Dedicated Admin TLS preflight passed; no Cloudflare changes.\n');
      return;
    }
    const token=process.env.CLOUDFLARE_API_TOKEN||await readHidden('Cloudflare Hyperdrive Write API token');
    if(token.length<20)throw Error('Cloudflare API token unavailable');
    const list=await cloudflare(token,API);
    if(!Array.isArray(list))throw Error('Cloudflare Hyperdrive inventory unavailable');
    const results=[];
    for(const item of ROLES){
      const found=list.filter(entry=>entry.name===item.name);
      if(found.length>1)throw Error('Duplicate dedicated Hyperdrive names');
      let entry=found[0];
      if(!entry){
        entry=await cloudflare(token,API,'POST',{
          name:item.name,
          origin:{scheme:'postgres',host:HOST,port:5432,database:'postgres',
            user:item.role+'.'+PROJECT,password:passwords.get(item.role)},
          mtls:{sslmode:'verify-full',ca_certificate_id:CA_ID},
          caching:{disabled:true},
        });
      }
      const verified=await cloudflare(token,API+'/'+encodeURIComponent(entry.id));
      results.push(inspectDedicatedAdminHyperdriveV1(verified,item));
    }
    process.stdout.write(JSON.stringify({hyperdrives:results})+'\n');
  }finally{passwords.clear();}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(()=>{process.stderr.write('Admin Hyperdrive bootstrap failed; no secrets printed. Check TLS, credentials and Cloudflare access.\n');process.exitCode=2;});
}
