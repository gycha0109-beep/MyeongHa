#!/usr/bin/env node
// Static/offline inventory. This does not replace PostgreSQL ACL checks or
// certify dynamically constructed SQL, production roles, or owner bypass.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MIGRATION_DIR = 'supabase/migrations/';
const allowed = Object.freeze({
  internal_apply_entitlement_effect_v1: [
    '1090_verified_receipt_capability_fulfillment_batch_v1.sql',
    '1770_official_reader_provider_revoke_scope_lock_private_v1.sql',
    '1830_official_reader_verified_cancel_unified_scope_private_v1.sql',
    '1850_official_reader_verified_cancel_atomic_batch_private_v1.sql',
  ],
  internal_apply_verified_receipt_capability_effects_v1: [
    '1760_official_reader_additional_bind_locked_private_v1.sql',
    '1790_official_reader_initial_product_scope_private_v1.sql',
    '1820_official_reader_unified_issue_bind_private_v1.sql',
  ],
  cmd_bind_standard_reading_access_v2: [
    '1760_official_reader_additional_bind_locked_private_v1.sql',
    '1790_official_reader_initial_product_scope_private_v1.sql',
    '1820_official_reader_unified_issue_bind_private_v1.sql',
  ],
  internal_apply_official_reader_provider_revoke_locked_v1: [
    '1780_official_reader_verified_provider_revoke_bridge_private_v1.sql',
  ],
  internal_apply_official_reader_verified_cancel_scope_v2: [
    '1830_official_reader_verified_cancel_unified_scope_private_v1.sql',
  ],
  internal_apply_official_reader_verified_cancel_batch_v1: [
    '1880_official_reader_cancel_reviewed_atomic_bridge_private_v1.sql',
  ],
});
const privateWriters = Object.freeze([
  'internal_apply_entitlement_effect_v1',
  'internal_apply_verified_receipt_capability_effects_v1',
  'internal_apply_official_reader_provider_revoke_locked_v1',
  'internal_execute_official_reader_verified_provider_revoke_v1',
  'internal_apply_official_reader_verified_cancel_scope_v2',
  'internal_execute_official_reader_verified_cancel_v2',
  'internal_apply_official_reader_verified_cancel_batch_v1',
  'internal_apply_reviewed_official_reader_full_cancel_private_v1',
  'internal_record_official_reader_portone_cancel_shadow_v1',
  'internal_apply_official_reader_unified_receipt_v1',
  'internal_cmd_bind_official_reader_unified_v1',
]);
const trackedSymbols = new Set([...privateWriters,...Object.keys(allowed)]);
const sqlCall = /\b(?:from|perform|select|call|:=)\s+(?:\*\s+from\s+)?public\.([a-z][a-z0-9_]*)\s*\(/gi;
const sqlDefinition = /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-z][a-z0-9_]*)\s*\(/gi;
const sqlGrant = /\bgrant\s+execute\s+on\s+function\s+public\.([a-z][a-z0-9_]*)\s*\(/gi;
const dml = /\b(insert\s+into|update|delete\s+from)\s+public\.(entitlement_grants|entitlement_events|entitlements|standard_reading_reader_access_grants)\b/gi;
const runtimeDirs=['apps/api/src/','apps/admin/src/','apps/web/src/','apps/mobile/src/','packages/'];

function enumerate(dir,predicate,out=[]) {
  for(const e of readdirSync(dir,{withFileTypes:true})){
    const p=join(dir,e.name);
    if(e.isDirectory()){
      if(!['node_modules','dist','coverage'].includes(e.name)&&!e.name.startsWith('.'))enumerate(p,predicate,out);
    }else if(predicate(p))out.push(p);
  }
  return out;
}
function findAll(line,re){
  return [...line.matchAll(new RegExp(re.source,re.flags))];
}
export function inspectText(file,body){
  const result={calls:[],definitions:[],grants:[],writes:[],runtime:[]};
  const rows=body.split(/\r?\n/u);
  for(let i=0;i<rows.length;i++){
    const line=rows[i],n=i+1;
    if(file.startsWith(MIGRATION_DIR)&&!/^\s*--/u.test(line)){
      for(const match of findAll(line,sqlCall)){
        if(trackedSymbols.has(match[1]))result.calls.push({file,line:n,symbol:match[1]});
      }
      for(const match of findAll(line,sqlDefinition)){
        if(trackedSymbols.has(match[1]))result.definitions.push({file,line:n,symbol:match[1]});
      }
      for(const match of findAll(line,sqlGrant)){
        if(trackedSymbols.has(match[1]))result.grants.push({file,line:n,symbol:match[1]});
      }
      for(const match of findAll(line,dml)){
        result.writes.push({file,line:n,operation:match[1].toUpperCase().replace(/\s+/gu,' '),table:match[2]});
      }
    }
    if(runtimeDirs.some(prefix=>file.startsWith(prefix))
      &&/\.(?:ts|tsx|mjs|js)$/u.test(file)
      &&!/\.(?:test|spec)\.[^.]+$/u.test(file)
      &&!/^\s*(?:\/\/|\*|\/\*)/u.test(line)){
      for(const symbol of privateWriters){
        if(new RegExp('\\b'+symbol+'\\b','u').test(line))result.runtime.push({file,line:n,symbol});
      }
    }
  }
  return result;
}
export function verifyInventory(scan){
  const issues=[], defined=new Set(scan.definitions.map(x=>x.symbol));
  for(const symbol of privateWriters){
    if(!defined.has(symbol))issues.push('expected private Writer missing: '+symbol);
  }
  for(const call of scan.calls){
    if(!(allowed[call.symbol]??[]).some(name=>call.file===MIGRATION_DIR+name))
      issues.push('unreviewed SQL caller: '+call.file+':'+call.line+' -> '+call.symbol);
  }
  for(const hit of scan.runtime)
    issues.push('runtime reference to private Writer: '+hit.file+':'+hit.line+' -> '+hit.symbol);
  for(const hit of scan.grants){
    if(hit.file.localeCompare(MIGRATION_DIR+'1890_official_reader_cancel_legacy_writer_execute_fence_v1.sql')>0)
      issues.push('post-fence private EXECUTE GRANT: '+hit.file+':'+hit.line+' -> '+hit.symbol);
  }
  return issues;
}
export function inspectRepository(root=ROOT){
  const paths=[
    ...enumerate(join(root,MIGRATION_DIR),p=>p.endsWith('.sql')),
    ...runtimeDirs.flatMap(dir=>{
      try{return enumerate(join(root,dir),p=>/\.(ts|tsx|mjs|js)$/u.test(p));}
      catch(e){if(e?.code==='ENOENT')return [];throw e;}
    }),
  ];
  const scan={calls:[],definitions:[],grants:[],writes:[],runtime:[]};
  for(const path of paths){
    const file=relative(root,path).split('\\').join('/');
    const part=inspectText(file,readFileSync(path,'utf8'));
    for(const key of Object.keys(scan))scan[key].push(...part[key]);
  }
  for(const key of Object.keys(scan)){
    scan[key].sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
  }
  return scan;
}
function selfTest(){
  const definitions=privateWriters.map(symbol=>({symbol}));
  const allowedCall=inspectText(MIGRATION_DIR+'1850_official_reader_verified_cancel_atomic_batch_private_v1.sql',
    'select * from public.internal_apply_entitlement_effect_v1(');
  if(verifyInventory({...allowedCall,definitions}).length)throw Error('legitimate caller rejected');
  const rogue=inspectText('apps/api/src/rogue.ts',
    "const query='select public.internal_apply_entitlement_effect_v1()';");
  if(!verifyInventory({...rogue,definitions}).some(x=>x.includes('runtime reference')))
    throw Error('rogue runtime call not detected');
  const unknown=inspectText(MIGRATION_DIR+'1901_rogue.sql',
    'select * from public.internal_apply_entitlement_effect_v1(');
  if(!verifyInventory({...unknown,definitions}).some(x=>x.includes('unreviewed SQL caller')))
    throw Error('new SQL call not detected');
  console.log('PASS Reader Writer inventory self-test: allowed, runtime bypass and unreviewed SQL');
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const mode=process.argv[2]??'--check';
  if(mode==='--self-test')selfTest();
  else if(mode==='--check'||mode==='--report'){
    const scan=inspectRepository(),issues=verifyInventory(scan);
    console.log('Reader Writer inventory: definitions='+scan.definitions.length+
      ' trusted SQL calls='+scan.calls.length+' DML hints='+scan.writes.length+
      ' app runtime references='+scan.runtime.length);
    if(mode==='--report'){
      for(const k of ['calls','writes','grants','runtime']){
        console.log(k.toUpperCase()+':');
        for(const row of scan[k])console.log('  '+row.file+':'+row.line+' '+(row.symbol??row.operation+' '+row.table));
      }
    }
    for(const issue of issues)console.error('FAIL '+issue);
    if(issues.length)process.exitCode=1;
    else console.log('PASS Reader Writer inventory: no new direct SQL or app runtime entrypoint');
  }else{
    console.error('Usage: node scripts/ci/official-reader-writer-call-graph.mjs [--check|--report|--self-test]');
    process.exitCode=2;
  }
}
