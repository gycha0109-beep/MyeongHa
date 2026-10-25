// Watchtower-Track: security
// Operator-only: reuse cached Wrangler auth; origin passwords stay in-process.
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{resolve,dirname,isAbsolute}from'node:path';import{createRequire}from'node:module';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
async function main(){
 const operatorFile=option('--operator-file'),moduleDir=option('--wrangler-module'),kind=option('--kind');
 if(!args.includes('--apply')||![operatorFile,moduleDir].every(p=>typeof p==='string'&&isAbsolute(p))||
    !['ordinary','governed'].includes(kind))throw Error('Explicit operator inputs required');
 const source=JSON.parse(await readFile(operatorFile,'utf8'));
 if(source.schemaVersion!=='seyeon-s0-operator-origins-v1')throw Error('Operator source mismatch');
 const origin=new URL(source.origins[kind]);
 const principal=kind==='ordinary'?'myeongha_seyeon_subject_login':'myeongha_seyeon_governed_login';
 if(origin.protocol!=='postgresql:'||origin.hostname!=='aws-0-ap-southeast-1.pooler.supabase.com'||
    origin.port!=='5432'||origin.pathname!=='/postgres'||
    decodeURIComponent(origin.username)!==principal+'.cnsfpcdiyofqvhpcegfc'||!origin.password||
    origin.search!=='?sslmode=verify-full')throw Error('Pinned origin mismatch');
 const manifest=JSON.parse(await readFile(resolve(moduleDir,'package.json'),'utf8'));
 if(manifest.name!=='wrangler'||manifest.version!=='4.152.0')throw Error('Pinned Wrangler required');
 process.env.WRANGLER_LOG_SANITIZE='true';process.env.WRANGLER_SEND_METRICS='false';
 process.env.WRANGLER_LOG_PATH=resolve(dirname(operatorFile),'wrangler-private');
 await mkdir(process.env.WRANGLER_LOG_PATH,{recursive:true,mode:0o700});
 const require=createRequire(import.meta.url),wrangler=require(moduleDir);
 const definition=wrangler.experimental_getWranglerCommands().registry.subtree.get('hyperdrive').subtree.get('create').definition;
 const config=wrangler.unstable_readConfig({config:'wrangler.jsonc'},{});
 const account='410d3f82ed3ccc66609a2b698803859b',ca='d25c14bc-d654-46b8-89cf-5c4baf931771';
 const name=kind==='ordinary'?'myeongha-seyeon-subject-verifyfull-20261025':'myeongha-seyeon-cost-verifyfull-20261025';
 const statePath=operatorFile+'.'+kind+'.provision-intent.json';
 const state={account,name,kind,caCertificateId:ca,sslmode:'verify-full',cachingDisabled:true,phase:'create_intent',startedAt:new Date().toISOString()};
 await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
 // Public command handler reuses Wrangler's authentication and sanitized API
 // logging. No OS argv, token-file inspection, or secret-bearing tool argument.
 await definition.handler({name,originHost:origin.hostname,originPort:5432,
   originScheme:'postgresql',database:'postgres',originUser:decodeURIComponent(origin.username),
   originPassword:decodeURIComponent(origin.password),cachingDisabled:true,
   caCertificateId:ca,sslmode:'verify-full',originConnectionLimit:5,updateConfig:false},
   {config:{...config,account_id:account}});
 state.phase='created_verify_remote_metadata';state.completedAt=new Date().toISOString();
 await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 console.log('S0_HYPERDRIVE_CREATED_VERIFY_ORIGIN_AND_TLS_METADATA');
}
main().catch(()=>{console.error('S0_HYPERDRIVE_PROVISION_FAILED_RECONCILE_BEFORE_RETRY');process.exitCode=1;});
