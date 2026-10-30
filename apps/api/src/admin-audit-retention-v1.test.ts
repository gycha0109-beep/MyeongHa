import {describe,it,expect} from 'vitest';
import {createAdminAuditRetentionMaintenanceV1} from './admin-audit-retention-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
describe('dedicated audit retention maintenance',()=>{
 it('uses a bounded fixed RPC and discards failed rollback connections',async()=>{
  const seen:{sql:string;values:readonly unknown[]|undefined}[]=[];let released:unknown;
  const failure=Error('rollback failed');
  const pool:PostgresSubjectPoolV1={async connect(){return{async query<Row>(sql:string,values?:readonly unknown[]){seen.push({sql,values});if(sql==='ROLLBACK')throw failure;if(sql.startsWith('SELECT current_user'))return{rows:[{role:'myeongha_admin_audit_writer'}]as unknown as Row[]};return{rows:[]as Row[]};},release(error){released=error;}};}};
  await expect(createAdminAuditRetentionMaintenanceV1(pool)(10)).rejects.toThrow('Dedicated');
  expect(seen.some(q=>q.sql.includes('cmd_purge'))).toBe(false);expect(released).toBe(failure);
 });
 it('rejects caller-selected deletion windows and accepts only a dedicated bounded result',async()=>{
  const seen:string[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return{async query<Row>(sql:string){seen.push(sql);return{rows:(sql.startsWith('SELECT current_user')?[{role:'myeongha_admin_retention_executor'}]:sql.includes('cmd_purge')?[{deleted:2}]:[])as unknown as Row[]};},release(){}};}};
  await expect(createAdminAuditRetentionMaintenanceV1(pool)(0)).rejects.toThrow('batch');
  await expect(createAdminAuditRetentionMaintenanceV1(pool)(1001)).rejects.toThrow('batch');expect(seen).toHaveLength(0);
  expect(await createAdminAuditRetentionMaintenanceV1(pool)(2)).toEqual({deleted:2});expect(seen.at(-1)).toBe('COMMIT');
 });
});
