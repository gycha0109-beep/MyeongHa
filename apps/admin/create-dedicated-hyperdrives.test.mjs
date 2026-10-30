import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import {inspectDedicatedAdminHyperdriveV1,classifyDedicatedAdminTlsFailureV1,parseDedicatedAdminPoolerPortV1,buildAuditRolePasswordSqlV1} from './create-dedicated-hyperdrives.mjs';

const expected={role:'myeongha_admin_reader',name:'myeongha-admin-reader-verifyfull-20261030'};
const valid={id:'a'.repeat(32),name:expected.name,caching:{disabled:true},
 mtls:{sslmode:'verify-full',ca_certificate_id:'d25c14bc-d654-46b8-89cf-5c4baf931771'},
 origin:{scheme:'postgres',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:6543,
 database:'postgres',user:'myeongha_admin_reader.cnsfpcdiyofqvhpcegfc'}};
test('dedicated reader TLS policy passes',()=>{
 assert.deepEqual(inspectDedicatedAdminHyperdriveV1(valid,expected),{role:expected.role,id:valid.id,verified:true});
});
for(const [name,change] of [
 ['reused public role',{origin:{...valid.origin,user:'postgres.cnsfpcdiyofqvhpcegfc'}}],
 ['reused audit role',{origin:{...valid.origin,user:'myeongha_admin_audit_writer.cnsfpcdiyofqvhpcegfc'}}],
 ['cache enabled',{caching:{disabled:false}}],
 ['TLS downgraded',{mtls:{...valid.mtls,sslmode:'require'}}],
 ['wrong CA',{mtls:{...valid.mtls,ca_certificate_id:'wrong'}}],
 ['wrong name',{name:'myeongha'}],
 ['wrong host',{origin:{...valid.origin,host:'example.com'}}],
 ['wrong port',{origin:{...valid.origin,port:5432}}],
 ['managed integration',{integration:{provider:'planetscale'}}],
 ['invalid ID',{id:'fake'}],
]){
 test('reject '+name,()=>assert.throws(
  ()=>inspectDedicatedAdminHyperdriveV1({...valid,...change},expected),/policy mismatch/u));
}

for(const [name,child,expectedCode] of [
  ['missing psql',{error:{code:'ENOENT'}},'PSQL_EXECUTABLE_NOT_FOUND'],
  ['psql timed out',{error:{code:'ETIMEDOUT'}},'PSQL_PROCESS_TIMEOUT'],
  ['bad password',{status:2,stderr:'FATAL: password authentication failed for user "hidden"'},'DB_PASSWORD_REJECTED'],
  ['bad CA',{status:2,stderr:'SSL error: certificate verify failed'},'TLS_CERTIFICATE_VALIDATION_FAILED'],
  ['DNS failure',{status:2,stderr:'could not translate host name'},'DB_DNS_FAILURE'],
  ['network refused',{status:2,stderr:'connection refused'},'DB_NETWORK_UNAVAILABLE'],
  ['unknown error',{status:2,stderr:'unexpected secret-shaped message'},'DB_TLS_LOGIN_FAILED'],
]){
 test('safe TLS diagnostic: '+name,()=>{
   assert.equal(classifyDedicatedAdminTlsFailureV1(child),expectedCode);
 });
}


test('explicit session pooler port still supported for debugging',()=>{
 assert.deepEqual(inspectDedicatedAdminHyperdriveV1({...valid,origin:{...valid.origin,port:5432}},expected,5432),{role:expected.role,id:valid.id,verified:true});
});
test('pooler port defaults to proven transaction mode',()=>{
 assert.equal(parseDedicatedAdminPoolerPortV1(undefined),6543);
 assert.equal(parseDedicatedAdminPoolerPortV1(''),6543);
 assert.equal(parseDedicatedAdminPoolerPortV1('6543'),6543);
 assert.equal(parseDedicatedAdminPoolerPortV1('5432'),5432);
});
test('unsupported pooler port fails closed',()=>{
 for(const value of ['6432','0','65535','foo',' 6543 '])
  assert.throws(()=>parseDedicatedAdminPoolerPortV1(value),/POOLER_PORT_UNSUPPORTED/u);
});

test('Audit Writer SQL quotes the exact local clipboard password',()=>{
 const password="A".repeat(25)+"'"+'b'.repeat(8);
 assert.equal(buildAuditRolePasswordSqlV1(password),
   "ALTER ROLE myeongha_admin_audit_writer WITH PASSWORD '"+password.replace(/'/gu,"''")+"';");
});
test('Audit Writer SQL rejects unsupported clipboard content',()=>{
 for(const value of ['short','A'.repeat(25)+'\\n','A'.repeat(25)+'\\u0000'])
  assert.throws(()=>buildAuditRolePasswordSqlV1(value),/CLIPBOARD_SECRET_INVALID/u);
});
