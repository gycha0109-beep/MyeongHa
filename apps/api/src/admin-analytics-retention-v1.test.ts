import {describe,expect,it} from 'vitest';
import {createAdminAnalyticsPostgresEventStoreV1} from './admin-analytics-pipeline-postgres-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

function mockPool(role='myeongha_analytics_writer') {
  const queries:string[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return{
    async query<Row=Record<string,unknown>>(sql:string){
      queries.push(sql);
      if(sql.startsWith('SELECT current_user'))return{rows:[{role}] as unknown as Row[]};
      if(sql.startsWith('WITH due AS (')&&sql.includes('DELETE FROM myeongha_admin_analytics.events_v1'))
        return{rows:[{id:'one'}] as unknown as Row[]};
      if(sql.startsWith('WITH due AS (')&&sql.includes('DELETE FROM myeongha_admin_analytics.consents_v1'))
        return{rows:[{id:'other'}] as unknown as Row[]};
      return{rows:[] as Row[]};
    },release(){}};
  }};
  return{pool,queries};
}

describe('bounded analytics 180-day retention',()=>{
  it('purges events before matching consents, with finite limits and no UPDATE privileges',async()=>{
    const h=mockPool(),store=createAdminAnalyticsPostgresEventStoreV1(h.pool);
    expect(await store.purgeExpired('2026-10-28T00:00:00Z')).toBe(2);
    const deletes=h.queries.filter(sql=>sql.startsWith('WITH due AS ('));
    expect(deletes).toHaveLength(2);
    expect(deletes[0]).toContain('LIMIT 1000');
    expect(deletes[0]).toContain('expires_at<=$1::timestamptz');
    expect(deletes[1]).toContain('NOT EXISTS');
    expect(deletes[1]).toContain('e.consent_version=c.version');
    expect(deletes[1]).toContain('LIMIT 1000');
    expect(deletes.join(' ')).not.toContain('FOR UPDATE');
    expect(h.queries.at(-1)).toBe('COMMIT');
  });
  it('denies a shared user principal before deleting any analytics data',async()=>{
    const h=mockPool('myeongha_api_executor');
    await expect(createAdminAnalyticsPostgresEventStoreV1(h.pool).purgeExpired('2026-10-28T00:00:00Z')).rejects.toThrow('Dedicated analytics writer');
    expect(h.queries.some(sql=>sql.startsWith('WITH due AS ('))).toBe(false);
    expect(h.queries.at(-1)).toBe('ROLLBACK');
  });
});
