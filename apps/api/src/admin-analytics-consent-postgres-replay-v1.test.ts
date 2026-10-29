import {describe,expect,it} from 'vitest';
import {createAdminAnalyticsPostgresEventStoreV1} from './admin-analytics-pipeline-postgres-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const VISITOR='av_'+'a'.repeat(64);
const SUBJECT='ah_'+'b'.repeat(64);
const CONSENT={
  visitorRef:VISITOR,version:'product-analytics-consent-180d-v1',
  granted:true,validVisitor:true,expiresAt:'2027-04-27T12:00:00.000Z',
};
const POLICY='product-analytics-180d-v1';

function harness(mode:'inserted'|'matching'|'withdrawn'|'mismatched'|'unavailable'){
  const statements:string[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return{
    async query<Row>(sql:string,values?:readonly unknown[]){
      statements.push(sql);
      if(sql.includes('SELECT current_user::text AS role'))return {
        rows:[{role:'myeongha_analytics_writer'}] as Row[],
      };
      if(sql.includes('INSERT INTO myeongha_admin_analytics.consents_v1'))
        return {rows:mode==='inserted'?[{visitorRef:values?.[0]}] as Row[]:[] as Row[]};
      if(sql.includes('SELECT true AS active FROM myeongha_admin_analytics.consents_v1'))
        return {rows:mode==='matching'?[{active:true}] as Row[]:[] as Row[]};
      return{rows:[] as Row[]};
    },release(){},
  };}};
  return{store:createAdminAnalyticsPostgresEventStoreV1(pool),statements};
}
describe('durable analytics consent grant replay',()=>{
  it('records a new consent once and commits',async()=>{
    const x=harness('inserted');
    await x.store.bindConsent(CONSENT,POLICY,SUBJECT);
    expect(x.statements).toContain('COMMIT');
    expect(x.statements.some(s=>s.includes('ON CONFLICT(visitor_ref,version) DO NOTHING'))).toBe(true);
    expect(x.statements.some(s=>s.includes('SELECT true AS active FROM myeongha_admin_analytics.consents_v1'))).toBe(false);
  });
  it('permits an exact, still-active same-version replay without creating a new receipt',async()=>{
    const x=harness('matching');
    await x.store.bindConsent(CONSENT,POLICY,SUBJECT);
    const query=x.statements.find(s=>s.includes('SELECT true AS active FROM myeongha_admin_analytics.consents_v1'))!;
    expect(query).toContain('subject_link_ref IS NOT DISTINCT FROM');
    expect(query).toContain('withdrawn_at IS NULL');
    expect(query).toContain('expires_at>CURRENT_TIMESTAMP');
    expect(x.statements).toContain('COMMIT');
  });
  it.each(['withdrawn','mismatched','unavailable'] as const)(
    'rejects a %s consent row without committing a re-grant',async mode=>{
      const x=harness(mode);
      await expect(x.store.bindConsent(CONSENT,POLICY,SUBJECT)).rejects.toThrow(
        'Conflicting or withdrawn analytics consent cannot be re-granted.',
      );
      expect(x.statements).toContain('ROLLBACK');
      expect(x.statements).not.toContain('COMMIT');
    },
  );
});
