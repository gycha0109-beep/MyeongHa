import {describe,it,expect} from 'vitest';
import {
 ADMIN_LIVE_READBACK_KINDS_V1,
 verifyAdminReadQueriesV1,
 verifyProductionAdminReadQueriesV1,
} from './production-read-query-readback.mjs';

describe('dedicated Admin Reader live data smoke',()=>{
 it('runs all already-approved menu reads through their real adapter contract',async()=>{
  const observed=[];
  const result=await verifyAdminReadQueriesV1({
   port:{async read(filters){
    observed.push(filters);
    return {rows:[{metricKey:'members_active'}],nextCursor:null};
   }},
   project(kind,rows,limit){
    expect(rows.rows).toHaveLength(1);
    expect(limit).toBe(kind==='overview'?20:2);
   },
  });
  expect(ADMIN_LIVE_READBACK_KINDS_V1).toHaveLength(20);
  expect(ADMIN_LIVE_READBACK_KINDS_V1).toEqual(expect.arrayContaining([
   'commerce-alerts','credit-reservations','credit-allocations','ai-errors','ai-estimates',
   'catalog','characters','content-releases','deletion-jobs','entitlement-events','provider-events',
  ]));
  expect(ADMIN_LIVE_READBACK_KINDS_V1).not.toContain('analytics');
  expect(ADMIN_LIVE_READBACK_KINDS_V1).not.toContain('user-detail');
  expect(observed.map(x=>x.kind)).toEqual(ADMIN_LIVE_READBACK_KINDS_V1);
  expect(observed.every(x=>x.subjectId===null&&x.from===null&&
   x.to===null&&x.cursor===null)).toBe(true);
  expect(result).toEqual({readOnly:true,verified:true,queryKindsChecked:20});
  expect(JSON.stringify(result)).not.toContain('members_active');
 });
 it('never substitutes zero rows or success for a database query failure',async()=>{
  let attempted=0;
  await expect(verifyAdminReadQueriesV1({
   port:{async read(){attempted++;throw Error('private-pg-details');}},
   project(){throw Error('should not project an unsuccessful query');},
  })).rejects.toThrow('Scoped Admin Reader query failed: overview');
  expect(attempted).toBe(1);
 });
 it('requires dedicated credentials before attempting any connection',async()=>{
  let connected=false;
  await expect(verifyProductionAdminReadQueriesV1({},{
   poolFactory(){connected=true;throw Error('unreachable');},
  })).rejects.toThrow('Dedicated Reader credentials unavailable');
  expect(connected).toBe(false);
 });
 it('verifies scoped Reader identity and TLS before reading and emits only safe counters',async()=>{
  const env={MYEONGHA_ADMIN_READ_DATABASE_URL:'synthetic-secret',
   MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM:'synthetic-ca'};
  let releaseCount=0,closed=0,queries=0;
  const target={connectionString:'postgresql://private:private@invalid/postgres',
   ssl:{rejectUnauthorized:true},backendTlsRequired:true};
  const factory=()=>({
   async connect(){
    return {
     async query(sql){
      expect(sql).toContain('AS restricted');
      return {rows:[{role:'myeongha_admin_reader',restricted:true,tls:true}]};
     },
     release(){releaseCount++;},
    };
   },
   async end(){closed++;},
  });
  const report=await verifyProductionAdminReadQueriesV1(env,{
   async targetFactory(){return target;},
   poolFactory:factory,
   async loadReadAdapter(){return {createAdminPostgresReadPortV1(){
    return {async read(){queries++;return {rows:[],nextCursor:null};}};
   }};},
   async loadProjection(){return {projectAdminRowsV1(){return {rows:[]};}};},
  });
  expect(report.verified).toBe(true);
  expect(queries).toBe(ADMIN_LIVE_READBACK_KINDS_V1.length);
  expect(releaseCount).toBe(1);
  expect(closed).toBe(1);
  expect(JSON.stringify(report)).not.toMatch(/private|secret|postgres/iu);
 });
 it('fails closed on wrong DB role without running customer-data queries',async()=>{
  let queries=0;
  const env={MYEONGHA_ADMIN_READ_DATABASE_URL:'synthetic-secret',
   MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM:'synthetic-ca'};
  const attempt=verifyProductionAdminReadQueriesV1(env,{
   async targetFactory(){return{connectionString:'private',
    ssl:{rejectUnauthorized:true},backendTlsRequired:true};},
   poolFactory(){return{
    async connect(){return{async query(){return{rows:[
     {role:'postgres',restricted:false,tls:true}]};},release(){}};},
    async end(){},
   };},
   async loadReadAdapter(){queries++;throw Error('not allowed');},
  });
  await expect(attempt).rejects.toThrow('Scoped Admin Reader queries could not be verified');
  expect(queries).toBe(0);
 });
});
