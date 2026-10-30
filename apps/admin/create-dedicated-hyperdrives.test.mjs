import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import {inspectDedicatedAdminHyperdriveV1,classifyDedicatedAdminTlsFailureV1} from './create-dedicated-hyperdrives.mjs';

const expected={role:'myeongha_admin_reader',name:'myeongha-admin-reader-verifyfull-20261030'};
const valid={id:'a'.repeat(32),name:expected.name,caching:{disabled:true},
 mtls:{sslmode:'verify-full',ca_certificate_id:'d25c14bc-d654-46b8-89cf-5c4baf931771'},
 origin:{scheme:'postgres',host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,
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
 ['wrong port',{origin:{...valid.origin,port:6432}}],
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
