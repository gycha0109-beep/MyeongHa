// Watchtower-Track: security
import {describe, expect, it} from 'vitest';
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
  it('reads effective executor authority, required private functions and immutable Pin column',async()=>{
    const {runner,queries}=runnerWithReadyRows([{ready:true}]);
    await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
      .resolves.toBeUndefined();
    expect(queries).toHaveLength(1);
    const sql=queries[0]!;
    expect(sql).toContain('pin_positive_model_context_sources_v1');
    expect(sql).toContain('pin_model_recent_sources_v1');
    expect(sql).toContain('cmd_mark_seyeon_positive_context_ready_pinned_v1');
    expect(sql).toContain('seyeon_recent_source_pin_jsonb');
    expect(sql).toContain("has_function_privilege(current_user, p.oid, 'EXECUTE')");
    expect(sql).toContain("has_schema_privilege(current_user, p.pronamespace, 'USAGE')");
    expect(sql).toContain('p.prosecdef');
    expect(sql.trimStart().startsWith('select')).toBe(true);
  });

  it('refuses missing or non-executable combined Pin before any paid Provider use',async()=>{
    const {runner}=runnerWithReadyRows([{ready:false}]);
    await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
      .rejects.toBeInstanceOf(SeyeonProductionPinMigrationRequiredV1);
  });

  it('refuses missing, multiple or malformed catalog readbacks',async()=>{
    for(const rows of [[],[{ready:true},{ready:true}],[{ready:null}]] as any[]){
      const {runner}=runnerWithReadyRows(rows);
      await expect(assertSeyeonProductionCombinedPinReadinessV1(runner,subjectId))
        .rejects.toBeInstanceOf(SeyeonProductionPinMigrationRequiredV1);
    }
  });
});
