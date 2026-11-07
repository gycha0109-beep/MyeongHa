// Watchtower-Track: security
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertSeyeonProductionCombinedPinReadinessV1,
  SeyeonProductionPinMigrationRequiredV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type {SeyeonProductionSubjectTransactionRunnerV1}
  from '../apps/api/src/seyeon-production-subject-transaction-v1.js';

const subjectId='11111111-1111-4111-8111-111111111111';
function runnerWithReadyRows(rows:readonly {ready:boolean}[]) {
  const queries:string[]=[];
  const runner={
    async run<T>(id:string, execute:(client:unknown)=>Promise<T>):Promise<T>{
      expect(id).toBe(subjectId);
      return execute({
        async query(sql:string){
          queries.push(sql);
          return {rows};
        },
      });
    },
  } as unknown as SeyeonProductionSubjectTransactionRunnerV1;
  return {runner,queries};
}

describe('S0 positive combined G1 pre-Turn readiness',()=>{
  it('reads exact private signatures through catalogs without requiring private schema USAGE',async()=>{
    const {runner,queries}=runnerWithReadyRows([{ready:true}]);
    await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
      .resolves.toBeUndefined();
    expect(queries).toHaveLength(1);
    const sql=queries[0]!;
    expect(sql).toContain('public.cmd_pin_seyeon_positive_model_context_sources_v1');
    expect(sql).toContain("n.nspname = 'seyeon_private'");
    expect(sql).toContain("p.proname = 'pin_positive_model_context_sources_v1'");
    expect(sql).toContain("p.proname = 'pin_model_recent_sources_v1'");
    expect(sql).toContain("p.pronargs = 16");
    expect(sql).toContain("p.pronargs = 7");
    expect(sql).toContain("p.proargtypes[15] = 'text'::regtype");
    expect(sql).toContain("p.proargtypes[6] = 'text'::regtype");
    expect(sql).not.toContain("to_regprocedure(\n            'seyeon_private.");
    expect(sql).toContain('pin_model_recent_sources_v1');
    expect(sql).toContain('cmd_mark_seyeon_positive_context_ready_pinned_v1');
    expect(sql).toContain('seyeon_recent_source_pin_jsonb');
    expect(sql).toContain("has_function_privilege(current_user, p.oid, 'EXECUTE')");
    expect(sql).toContain("not has_function_privilege(current_user, p.oid, 'EXECUTE')");
    expect(sql).toContain("not has_function_privilege('anon', p.oid, 'EXECUTE')");
    expect(sql).toContain("not has_function_privilege('authenticated', p.oid, 'EXECUTE')");
    expect(sql).toContain("not has_function_privilege('service_role', p.oid, 'EXECUTE')");
    expect(sql).toContain("has_schema_privilege(current_user, p.pronamespace, 'USAGE')");
    expect(sql).toContain('p.prosecdef');
    expect(sql.trimStart().startsWith('select')).toBe(true);
  });

  it('keeps the private DB function hidden and the new public owner entrypoint default-denied',()=>{
    const source=readFileSync(new URL(
      '../scripts/operations/seyeon-security-s0/17-g1-positive-combined-model-source-pin.sql',
      import.meta.url,
    ),'utf8');
    const adapter=readFileSync(new URL(
      '../apps/api/src/seyeon-g1-positive-combined-source-port-v1.ts',
      import.meta.url,
    ),'utf8');
    expect(source).toContain(
      'create function public.cmd_pin_seyeon_positive_model_context_sources_v1(');
    expect(source).toContain(
      'owner to myeongha_seyeon_chat_runtime_owner;');
    expect(source).toContain(
      'revoke all on function public.cmd_pin_seyeon_positive_model_context_sources_v1(');
    expect(source).toContain('from public,anon,authenticated,service_role,myeongha_api_executor;');
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.cmd_pin_seyeon_positive_model_context_sources_v1/iu);
    expect(adapter).toContain(
      'select public.cmd_pin_seyeon_positive_model_context_sources_v1(');
    expect(adapter).not.toContain(
      'select seyeon_private.pin_positive_model_context_sources_v1(');
  });

  it('refuses missing or non-executable combined Pin before any paid Provider use',async()=>{
    const {runner}=runnerWithReadyRows([{ready:false}]);
    await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
      .rejects.toBeInstanceOf(SeyeonProductionPinMigrationRequiredV1);
  });

  it('refuses missing, multiple or malformed catalog readbacks',async()=>{
    const malformed = [{ready:null}] as unknown as {ready:boolean}[];
    for(const rows of [[],[{ready:true},{ready:true}],malformed]){
      const {runner}=runnerWithReadyRows(rows);
      await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
        .rejects.toBeInstanceOf(SeyeonProductionPinMigrationRequiredV1);
    }
  });
});
