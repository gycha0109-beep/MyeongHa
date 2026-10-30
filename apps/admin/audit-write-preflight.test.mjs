import {describe,it,expect} from 'vitest';
import {verifyAdminAuditWriteV1} from './audit-write-preflight.mjs';

const env={MYEONGHA_ADMIN_AUDIT_DATABASE_URL:'synthetic-private-url',
 MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM:'synthetic-private-cert'};
function fixture(failure){
 const calls=[];let discarded=false;
 return {calls,get discarded(){return discarded;},options:{
  targetFactory(){return{connectionString:'synthetic-private-url',ssl:{rejectUnauthorized:true}};},
  poolFactory(){return{async connect(){return{
   async query(sql,values){
    calls.push({sql,values});
    if(sql.includes('AS restricted'))return{rows:[{role:failure==='identity'?'postgres':'myeongha_admin_audit_writer',restricted:true,tls:true}]};
    if(sql==='ROLLBACK'&&failure==='rollback')throw Error('synthetic-private-error');
    if(sql.startsWith('INSERT')){
     if(failure==='append')throw Error('synthetic-private-error');
     if(values[1]==='invalid-probe-outcome')throw Object.assign(Error('synthetic-private-row'),{code:failure==='constraint'?'42501':'23514'});
     return{rows:[],rowCount:1};
    }
    if(sql.startsWith('SELECT')||sql.startsWith('EXPLAIN')){
     if(failure==='leak')return{rows:[]};
     throw Object.assign(Error('synthetic-private-error'),{code:failure==='network'?'08006':'42501'});
    }
    return{rows:[]};
   },release(error){discarded=!!error;},
  };},async end(){}};},
 }};
}
describe('dedicated Audit Writer real-operation staging preflight',()=>{
 it('appends and validates permission/constraint failures, then rolls back every probe',async()=>{
  const f=fixture();const result=await verifyAdminAuditWriteV1(env,f.options);
  expect(result).toEqual({auditWriteVerified:true,permissionDenialsVerified:3,
   invalidAuditRejected:true,transactionRolledBack:true,activationEnabled:false,missing:[]});
  expect(f.calls[0].sql).toBe('BEGIN');expect(f.calls.at(-1).sql).toBe('ROLLBACK');
  expect(f.calls.some(x=>x.sql==='COMMIT')).toBe(false);
  expect(f.calls.filter(x=>x.sql.startsWith('INSERT'))).toHaveLength(2);
  expect(f.calls.some(x=>/^(UPDATE|DELETE|ALTER|GRANT|CREATE)\b/u.test(x.sql))).toBe(false);
  expect(JSON.stringify(result)).not.toContain('synthetic-private');
 });
 it.each(['identity','append','leak','network','constraint','rollback'])('fails closed and rolls back on %s failure',async failure=>{
  const f=fixture(failure);const result=await verifyAdminAuditWriteV1(env,f.options);
  expect(result.auditWriteVerified).toBe(false);
  expect(f.calls.some(x=>x.sql==='ROLLBACK')).toBe(true);
  expect(f.calls.some(x=>x.sql==='COMMIT')).toBe(false);
  expect(JSON.stringify(result)).not.toContain('synthetic-private');
  if(failure==='rollback'){expect(f.discarded).toBe(true);expect(result.transactionRolledBack).toBe(false);}
 });
 it('reports missing names without touching a database',async()=>{
  const f=fixture();const result=await verifyAdminAuditWriteV1({},f.options);
  expect(result.auditWriteVerified).toBe(false);expect(result.missing).toHaveLength(2);
  expect(f.calls).toHaveLength(0);
 });
});
