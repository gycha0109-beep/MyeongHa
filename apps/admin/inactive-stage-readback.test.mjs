import {describe,it,expect} from 'vitest';
import {inspectDisabledAdminWorkerSettingsV1,verifyDisabledAdminWorkerStageV1} from './inactive-stage-readback.mjs';

const expected={MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:'a'.repeat(32),
 MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:'b'.repeat(32)};
const bindings=()=>[
 ...['MYEONGHA_ADMIN_PRIVATE_ENABLED','MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED',
 'MYEONGHA_ADMIN_RETENTION_ENABLED','MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED']
 .map(name=>({type:'plain_text',name,text:'false'})),
 {name:'MYEONGHA_ADMIN_HYPERDRIVE_POLICY',type:'plain_text',text:'dedicated-admin-verify-full-v1'},
 {name:'ADMIN_READ_HYPERDRIVE',type:'hyperdrive',id:expected.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID},
 {name:'ADMIN_AUDIT_HYPERDRIVE',type:'hyperdrive',id:expected.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID},
 {name:'MYEONGHA_SUPABASE_API_KEY',type:'secret_text'},
 {name:'ASSETS',type:'assets'},
 {name:'ADMIN_RATE_LIMITER',type:'ratelimit'},
];
describe('inactive Admin Worker stage readback',()=>{
 it('verifies all disabled flags, dedicated origins and required bindings',()=>{
  expect(inspectDisabledAdminWorkerSettingsV1(bindings(),expected)).toEqual({
   worker:'myeongha-admin',disabled:true,originsVerified:true,memberVerificationKeyInstalled:true,
  });
 });
 it('requires exactly the scoped Cloudflare readback, and rejects API failures',async()=>{
  let called;
  const input={accountId:'c'.repeat(32),apiToken:'test-token-that-is-not-real',
   readHyperdriveId:expected.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
   auditHyperdriveId:expected.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID};
  const result=await verifyDisabledAdminWorkerStageV1({...input,
   async fetchImpl(url,options){
    called={url,options};
    return {ok:true,async json(){return{success:true,result:{bindings:bindings()}};}};
   },
  });
  expect(result.disabled).toBe(true);
  expect(called.url).toContain('/workers/scripts/myeongha-admin/settings');
  expect(called.options.method).toBe('GET');
  expect(called.options.redirect).toBe('error');
  await expect(verifyDisabledAdminWorkerStageV1({...input,
   async fetchImpl(){return{ok:false};},
  })).rejects.toThrow('Admin stage readback unavailable');
 });
 it('rejects enabled features, swapped origins, and absent rate limits',()=>{
  for(const key of ['MYEONGHA_ADMIN_PRIVATE_ENABLED','MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED',
   'MYEONGHA_ADMIN_RETENTION_ENABLED','MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED']){
   const changed=bindings().map(b=>b.name===key?{...b,text:'true'}:b);
   expect(()=>inspectDisabledAdminWorkerSettingsV1(changed,expected)).toThrow();
  }
  expect(()=>inspectDisabledAdminWorkerSettingsV1(bindings(),{
   ...expected,MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:'c'.repeat(32),
  })).toThrow();
  expect(()=>inspectDisabledAdminWorkerSettingsV1(bindings().filter(b=>b.name!=='ADMIN_RATE_LIMITER'),expected)).toThrow();
 });
});
