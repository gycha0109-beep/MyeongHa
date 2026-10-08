import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve, sep } from 'node:path';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const runner = readFileSync('scripts/operations/run-supabase-production-migrations.sh','utf8').replaceAll('\r\n','\n');
const workflow = readFileSync('.github/workflows/supabase-production.yml','utf8').replaceAll('\r\n','\n');
function fixture(run: (dir: string, env: NodeJS.ProcessEnv) => void) {
  const dir=mkdtempSync(join(tmpdir(),'myeongha-promotion-scope-'));
  const unix=(path:string)=>path.replaceAll('\\','/');
  const trace=join(dir,'trace.txt');
  writeFileSync(trace,'');
  const stubs: Record<string,string>={
    python3: '#!/usr/bin/env bash\ncat >/dev/null\nprintf fixture-password',
    psql: '#!/usr/bin/env bash\nprintf "psql ssl=%s user=%s args=%s\\n" "$PGSSLMODE" "$PGUSER" "$*" >> "$FIXTURE_TRACE"\nif [[ "$*" == *-Atqc* ]]; then printf "%s" "${FIXTURE_APPLIED_VERSION-20261007150457}"; fi\nexit "${FIXTURE_PSQL_STATUS:-0}"',
    supabase: '#!/usr/bin/env bash\nprintf "supabase %s %s %s %s %s\\n" "$1" "$2" "$3" "$4" "$5" >> "$FIXTURE_TRACE"',
    git: '#!/usr/bin/env bash\nif [[ "$1" == diff ]]; then printf "%s\\n" "$FIXTURE_CHANGED_PATHS"; fi',
  };
  for(const [name,source] of Object.entries(stubs)){writeFileSync(join(dir,name),source);chmodSync(join(dir,name),0o700);}
  const env={...process.env,PATH:dir+delimiter+process.env.PATH,FIXTURE_TRACE:unix(trace),SUPABASE_PROJECT_ID:'cnsfpcdiyofqvhpcegfc',SUPABASE_DB_PASSWORD:'fixture-only',SUPABASE_PRODUCTION_SESSION_POOLER_HOST:'fixture.pooler.supabase.com'};
  try{run(dir,env);}finally{
    const absolute=resolve(dir);const parent=resolve(tmpdir())+sep;
    if(!absolute.startsWith(parent)||!absolute.includes('myeongha-promotion-scope-'))throw new Error('Unexpected fixture cleanup target');
    rmSync(absolute,{recursive:true,force:true});
  }
}
const repairFile='supabase/migrations/20261007150457_guest_promotion_auth_fk_validation.sql';
describe('single approved production promotion repair',()=>{
  it('applies only the approved function and records only its migration version',()=>fixture((dir,env)=>{
    execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_PROMOTION_REPAIR_ONLY:'true'},stdio:'pipe'});
    const trace=readFileSync(join(dir,'trace.txt'),'utf8');
    expect(trace).toContain(`psql ssl=require user=postgres.cnsfpcdiyofqvhpcegfc args=-X -v ON_ERROR_STOP=1 -1 -f ${repairFile}`);
    expect(trace).toContain('supabase migration repair 20261007150457 --status applied');
    expect(trace).not.toContain('db push');
    expect(trace).not.toContain('20260830072444');
    expect(trace).not.toContain('20260902193252');
  }));
  it('does not mark any history applied when SQL application fails',()=>fixture((dir,env)=>{
    expect(()=>execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_PROMOTION_REPAIR_ONLY:'true',FIXTURE_PSQL_STATUS:'1'},stdio:'pipe'})).toThrow();
    expect(readFileSync(join(dir,'trace.txt'),'utf8')).not.toMatch(/^supabase /m);
  }));
  it('rejects an invalid scope without deploying SQL or repairing history',()=>fixture((dir,env)=>{
    expect(()=>execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_PROMOTION_REPAIR_ONLY:'invalid'},stdio:'pipe'})).toThrow();
    expect(readFileSync(join(dir,'trace.txt'),'utf8')).toBe('');
  }));
  it('does not report deployment success when the exact migration history is absent',()=>fixture((_dir,env)=>{
    expect(()=>execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_PROMOTION_REPAIR_ONLY:'true',FIXTURE_APPLIED_VERSION:''},stdio:'pipe'})).toThrow();
  }));
  it.each([
    ['push',repairFile,true],
    ['push',`${repairFile}\nsupabase/migrations/1400_unapproved.sql`,false],
    ['push','docs/example.md',false],
    ['workflow_dispatch',repairFile,false],
  ])('routes %s with changed migrations %s to narrow scope=%s',(event,changed,narrow)=>fixture((dir,env)=>{
    const block=workflow.split('      - name: Determine governed Production DB relevance')[1].split('\n  deploy:')[0].split('        run: |\n')[1];
    const gitFixture='git() { if [[ "$1" == diff ]]; then printf "%s\\n" "$FIXTURE_CHANGED_PATHS"; fi; }\n';
    const script=gitFixture+block.split('\n').map(line=>line.replace(/^          /,'')).join('\n');
    const output=join(dir,'output.txt');
    execFileSync(bash,[],{input:script,env:{...env,EVENT_NAME:event,BEFORE_SHA:'fixture-before',CURRENT_SHA:'fixture-current',FIXTURE_CHANGED_PATHS:changed,GITHUB_OUTPUT:output.replaceAll('\\','/'),GITHUB_STEP_SUMMARY:join(dir,'summary.txt').replaceAll('\\','/')},stdio:'pipe'});
    expect(readFileSync(output,'utf8')).toContain(`promotion_repair_only=${narrow}`);
  }));
});


const seyeonRepairFile='supabase/migrations/20261008043000_seyeon_manifest_acl_restore.sql';
describe('single approved Production Seyeon ContentManifest ACL repair',()=>{
  it('applies only the reviewed ACL SQL and records only its migration version',()=>fixture((dir,env)=>{
    execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:'true',FIXTURE_APPLIED_VERSION:'20261008043000'},stdio:'pipe'});
    const trace=readFileSync(join(dir,'trace.txt'),'utf8');
    expect(trace).toContain('psql ssl=require user=postgres.cnsfpcdiyofqvhpcegfc args=-X -v ON_ERROR_STOP=1 -1 -f '+seyeonRepairFile);
    expect(trace).toContain('supabase migration repair 20261008043000 --status applied');
    expect(trace).not.toContain('db push');
    expect(trace).not.toContain('20260830072444');
    expect(trace).not.toContain('20260902193252');
    expect(trace).not.toContain('20261007150457');
  }));
  it('does not record history after an ACL SQL failure',()=>fixture((dir,env)=>{
    expect(()=>execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:'true',FIXTURE_PSQL_STATUS:'1'},stdio:'pipe'})).toThrow();
    expect(readFileSync(join(dir,'trace.txt'),'utf8')).not.toMatch(/^supabase /m);
  }));
  it('rejects missing exact version in the migration history',()=>fixture((_dir,env)=>{
    expect(()=>execFileSync(bash,[],{input:runner,env:{...env,SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:'true',FIXTURE_APPLIED_VERSION:''},stdio:'pipe'})).toThrow();
  }));
  it('rejects unapproved or simultaneously enabled repair scopes',()=>fixture((dir,env)=>{
    for(const scoped of [
      {SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:'other'},
      {SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:'true',SUPABASE_PROMOTION_REPAIR_ONLY:'true'},
    ]) {
      expect(()=>execFileSync(bash,[],{input:runner,env:{...env,...scoped},stdio:'pipe'})).toThrow();
    }
    expect(readFileSync(join(dir,'trace.txt'),'utf8')).toBe('');
  }));
  it.each([
    ['push',seyeonRepairFile,true],
    ['push',seyeonRepairFile+'\nsupabase/migrations/1400_unapproved.sql',false],
    ['push','docs/example.md',false],
    ['workflow_dispatch',seyeonRepairFile,false],
    ['push',repairFile,false],
  ])('selects Seyeon ACL-only scope for %s with %s = %s',(event,changed,narrow)=>fixture((dir,env)=>{
    const block=workflow.split('      - name: Determine governed Production DB relevance')[1].split('\n  deploy:')[0].split('        run: |\n')[1];
    const gitFixture='git() { if [[ "$1" == diff ]]; then printf "%s\\n" "$FIXTURE_CHANGED_PATHS"; fi; }\n';
    const script=gitFixture+block.split('\n').map(line=>line.replace(/^          /,'')).join('\n');
    const output=join(dir,'output.txt');
    execFileSync(bash,[],{input:script,env:{...env,EVENT_NAME:event,BEFORE_SHA:'fixture-before',CURRENT_SHA:'fixture-current',FIXTURE_CHANGED_PATHS:changed,GITHUB_OUTPUT:output.replaceAll('\\','/'),GITHUB_STEP_SUMMARY:join(dir,'summary.txt').replaceAll('\\','/')},stdio:'pipe'});
    expect(readFileSync(output,'utf8')).toContain('seyeon_manifest_repair_only='+narrow);
  }));
  it('restores only the sanctioned invoker function and executor column privileges',()=>{
    const sql=readFileSync(seyeonRepairFile,'utf8');
    expect(sql).toContain('not p.prosecdef');
    expect(sql).toContain('grant select (');
    expect(sql).toContain('grant execute on function public.qry_content_bundle_manifest_v1(uuid)');
    expect(sql).toContain('revoke all on function public.qry_content_bundle_manifest_v1(uuid) from public');
    expect(sql).toContain('has_column_privilege');
    expect(sql).not.toMatch(/\bgrant\s+(?:all|usage)\s+on\s+(?:all\s+)?tables?\b/iu);
  });
});
