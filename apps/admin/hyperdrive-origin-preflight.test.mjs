import {describe,it,expect} from 'vitest';
import {inspectAdminHyperdriveOriginV1,verifyAdminHyperdriveOriginsV1} from './hyperdrive-origin-preflight.mjs';

const read='a'.repeat(32),audit='b'.repeat(32);
const base={id:read,name:'myeongha-admin-reader-test',
 caching:{disabled:true},
 mtls:{sslmode:'verify-full',ca_certificate_id:'d25c14bc-d654-46b8-89cf-5c4baf931771'},
 origin:{host:'aws-0-ap-southeast-1.pooler.supabase.com',port:5432,scheme:'postgresql',
  user:'myeongha_admin_reader.cnsfpcdiyofqvhpcegfc',database:'postgres'},
};
const auditConfig={...base,id:audit,name:'myeongha-admin-audit-test',
 origin:{...base.origin,user:'myeongha_admin_audit_writer.cnsfpcdiyofqvhpcegfc'}};
describe('dedicated Admin Hyperdrive origin preflight',()=>{
 it('checks live IDs, actual project-specific logins, verify-full and disabled caching',async()=>{
  const calls=[];
  const result=await verifyAdminHyperdriveOriginsV1({
   accountId:'c'.repeat(32),apiToken:'synthetic-api-token-only',
   readId:read,auditId:audit,async fetchImpl(url,options){
    calls.push({url,options});
    return{ok:true,async json(){return{success:true,
     result:url.endsWith(read)?base:auditConfig};}};
   },
  });
  expect(result).toEqual({dedicatedHyperdrivesVerified:true,roles:[
   {role:'myeongha_admin_reader',verified:true},
   {role:'myeongha_admin_audit_writer',verified:true},
  ]});
  expect(calls).toHaveLength(2);
  expect(calls.every(x=>x.options.method==='GET')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('synthetic-api-token-only');
 });
 it('rejects a bound customer service principal, unsafe TLS and cached origins',()=>{
  const check=x=>inspectAdminHyperdriveOriginV1(x,'myeongha_admin_reader',read);
  expect(check(base).verified).toBe(true);
  for(const changed of [
   {...base,origin:{...base.origin,user:'postgres.cnsfpcdiyofqvhpcegfc'}},
   {...base,origin:{...base.origin,host:'db.some-other-project.supabase.co'}},
   {...base,mtls:{...base.mtls,sslmode:'require'}},
   {...base,caching:{disabled:false}},
   {...base,id:audit},
   {...base,origin:{...base.origin,database:'other'}},
  ])expect(()=>check(changed)).toThrow();
 });
 it('fails closed if live origin metadata is missing or unavailable',async()=>{
  const input={accountId:'c'.repeat(32),apiToken:'synthetic-api-token-only',readId:read,auditId:audit};
  await expect(verifyAdminHyperdriveOriginsV1({...input,auditId:read}))
   .rejects.toThrow('Dedicated Admin Hyperdrive verification configuration unavailable');
  await expect(verifyAdminHyperdriveOriginsV1({...input,async fetchImpl(){throw Error('synthetic private information');}}))
   .rejects.toThrow('Dedicated Admin Hyperdrive readback unavailable');
 });
});
