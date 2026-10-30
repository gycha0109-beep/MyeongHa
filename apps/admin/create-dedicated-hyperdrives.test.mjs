import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {inspectDedicatedAdminHyperdriveV1} from './create-dedicated-hyperdrives.mjs';

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
