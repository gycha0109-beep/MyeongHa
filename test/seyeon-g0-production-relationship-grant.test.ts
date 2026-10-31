import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const root=new URL('../scripts/operations/seyeon-security-s0/',import.meta.url);
const original=readFileSync(new URL('14-g0-relationship-event-original-lineage.sql',root),'utf8').replace(/\r\n/g,'\n');
const production=readFileSync(new URL('production-14-g0-relationship-original-lineage-20261101.sql',root),'utf8').replace(/\r\n/g,'\n');
const ownerGrant='grant execute on function public.qry_production_relationship_history_runtime_v1(\n  uuid,text,bigint\n) to myeongha_seyeon_chat_runtime_owner;';

describe('production S0/14 grants only the intended relationship function',()=>{
  it('preserves all original S0/14 table policies, source checks, and return paths',()=>{
    const script=production.replace(/^-- Production-only scoped ownership grant\. The rest is verbatim S0\/14\.\n/,'');
    const start=script.indexOf('-- Existing relationship function is owned');
    const end=script.indexOf('grant myeongha_seyeon_chat_runtime_owner to current_user;',start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const reconstructed=script.slice(0,start)+ownerGrant+'\n\n'+script.slice(end);
    expect(reconstructed.trimEnd()).toBe(original.trimEnd());
  });
  it('requires temporary role ownership followed by restoring original membership',()=>{
    expect(production).toContain('grant myeongha_relationship_apply_owner to current_user with set true;');
    expect(production).toContain('set local role myeongha_relationship_apply_owner;');
    expect(production).toContain(ownerGrant);
    expect(production).toContain('reset role;');
    expect(production).toContain('revoke myeongha_relationship_apply_owner from current_user;');
    expect(production).toContain('membership postcondition failed; roll back');
    expect(production).toContain("member.rolname=current_user and grantor.rolname='supabase_admin'");
    expect(production).toContain('not am.inherit_option and not am.set_option');
  });
});
