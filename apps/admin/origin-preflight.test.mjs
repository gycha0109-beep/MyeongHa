import {describe,it,expect} from 'vitest';
import {inspectAdminOriginRolesV1,ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1} from './origin-preflight.mjs';
describe('read-only dedicated origin preflight',()=>{
 it('reports only missing names without attempting connections',async()=>{
  let connected=0;const report=await inspectAdminOriginRolesV1({}, {poolFactory(){connected++;throw Error('unexpected');}});
  expect(report.missing).toEqual(ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1);expect(connected).toBe(0);expect(report.activationEnabled).toBe(false);
 });
 it('verifies all three restricted TLS identities using read-only metadata and prints no credentials',async()=>{
  const seen=[];let currentRole;
  const env=Object.fromEntries(ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1.map(key=>[key,'synthetic-secret-value']));
  const report=await inspectAdminOriginRolesV1(env,{targetFactory(_env,role){currentRole=role;return {connectionString:'postgresql://test:secret@invalid/db',ssl:{rejectUnauthorized:true}};},poolFactory(){const role=currentRole;return{async connect(){return{async query(sql){seen.push(sql);return{rows:sql.includes('AS restricted')?[{role,restricted:true,tls:true}]:sql.startsWith('SELECT has_')?[{isolated:true}]:[]};},release(){}};},async end(){}};}});
  expect(report.originRolesVerified).toBe(true);expect(report.roles).toHaveLength(3);expect(report.activationEnabled).toBe(false);
  expect(JSON.stringify(report)).not.toContain('secret');expect(seen.filter(sql=>sql==='BEGIN READ ONLY')).toHaveLength(3);
  expect(seen.some(sql=>/^(?:INSERT|DELETE|UPDATE|ALTER|GRANT|CREATE)/u.test(sql))).toBe(false);
 });
 it('fails closed if an origin exposes broader privilege or an unencrypted connection',async()=>{
  const env=Object.fromEntries(ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1.map(key=>[key,'synthetic-secret-value']));
  const report=await inspectAdminOriginRolesV1(env,{targetFactory(){return{connectionString:'test'};},poolFactory(){return{async connect(){return{async query(sql){return{rows:sql.includes('AS restricted')?[{role:'postgres',restricted:false,tls:false}]:[]};},release(){}};},async end(){}};}});
  expect(report.originRolesVerified).toBe(false);expect(report.roles.every(r=>!r.verified)).toBe(true);
 });
 it('requires a distinct restricted analytics writer when its origin is configured',async()=>{
  const seen=[];let role;
  const env={
   ...Object.fromEntries(ADMIN_ORIGIN_PREFLIGHT_REQUIRED_V1.map(key=>[key,'synthetic-value'])),
   MYEONGHA_ADMIN_ANALYTICS_WRITER_DATABASE_URL:'postgresql://myeongha_analytics_writer:secret@db.invalid/postgres',
  };
  const report=await inspectAdminOriginRolesV1(env,{
   targetFactory(_env,currentRole){role=currentRole;return{connectionString:'postgresql://test:secret@db.invalid/postgres',ssl:{rejectUnauthorized:true}};},
   poolFactory(){const selected=role;return{async connect(){return{
    async query(sql){seen.push({role:selected,sql});return{rows:sql.includes('AS restricted')
      ?[{role:selected,restricted:true,tls:true}]:sql.startsWith('SELECT has_')?[{isolated:true}]:[]};},
    release(){},
   };},async end(){}};
   },
  });
  expect(report.originRolesVerified).toBe(true);
  expect(report.roles).toHaveLength(4);
  expect(report.roles.at(-1)).toEqual({role:'myeongha_analytics_writer',verified:true});
  const privilege=seen.find(x=>x.role==='myeongha_analytics_writer'&&x.sql.startsWith('SELECT has_'))?.sql;
  expect(privilege).toContain('myeongha_admin_analytics.events_v1');
  expect(privilege).toContain('withdrawn_at');
  expect(privilege).toContain('subject_link_ref');
  expect(seen.filter(x=>x.sql==='BEGIN READ ONLY')).toHaveLength(4);
  expect(report.activationEnabled).toBe(false);
 });

});
