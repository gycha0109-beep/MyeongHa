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
});
