import {describe,it,expect} from 'vitest';
import {prepareAdminReadOnlyReleaseV1,inspectAdminReadOnlyReleaseV1,verifyAdminReadOnlyReleaseV1} from './readonly-release.mjs';

const expected={MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:'a'.repeat(32),
  MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:'b'.repeat(32)};
const disabled={
  name:'myeongha-admin',workers_dev:true,preview_urls:false,
  assets:{binding:'ASSETS',run_worker_first:true},ratelimits:[{name:'ADMIN_RATE_LIMITER'}],
  services:[{binding:'MEMBER_AUTH_SERVICE',service:'myeongha'}],
  vars:{MYEONGHA_ADMIN_PRIVATE_ENABLED:'false',MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED:'false',
    MYEONGHA_ADMIN_RETENTION_ENABLED:'false',MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED:'false',
    MYEONGHA_ADMIN_HYPERDRIVE_POLICY:'dedicated-admin-verify-full-v1'},
  hyperdrive:[{binding:'ADMIN_READ_HYPERDRIVE',id:expected.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID},
    {binding:'ADMIN_AUDIT_HYPERDRIVE',id:expected.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID}],
};
const bindings=()=>[
  ...Object.entries(disabled.vars).map(([name,text])=>({name,type:'plain_text',text})),
  ...disabled.hyperdrive.map(value=>({name:value.binding,type:'hyperdrive',id:value.id})),
  {name:'MEMBER_AUTH_SERVICE',type:'service',service:'myeongha'},
  {name:'MYEONGHA_SUPABASE_API_KEY',type:'secret_text'},
  {name:'ASSETS',type:'assets'},{name:'ADMIN_RATE_LIMITER',type:'ratelimit'},
];

describe('dedicated read-only Admin release',()=>{
 it('releases only the private read flag and maintains the disabled rollback artifact',()=>{
  const on=prepareAdminReadOnlyReleaseV1(disabled,'readonly');
  expect(on.vars).toEqual({...disabled.vars,MYEONGHA_ADMIN_PRIVATE_ENABLED:'true'});
  expect(on.hyperdrive).toEqual(disabled.hyperdrive);
  expect(on.services).toEqual([{binding:'MEMBER_AUTH_SERVICE',service:'myeongha'}]);
  expect(on).not.toBe(disabled);
  expect(disabled.vars.MYEONGHA_ADMIN_PRIVATE_ENABLED).toBe('false');
  expect(prepareAdminReadOnlyReleaseV1(disabled,'disabled')).toEqual(disabled);
 });
 it('fails closed on unexpected privileged origins, policy, or flags',()=>{
  for(const binding of ['ADMIN_COMMAND_HYPERDRIVE','ADMIN_RETENTION_HYPERDRIVE','ADMIN_ANALYTICS_RETENTION_HYPERDRIVE']){
    expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,hyperdrive:[...disabled.hyperdrive,{binding,id:'c'.repeat(32)}]},'readonly')).toThrow();
    expect(()=>inspectAdminReadOnlyReleaseV1([...bindings(),{name:binding,type:'hyperdrive',id:'c'.repeat(32)}],expected,'readonly')).toThrow();
  }
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,vars:{...disabled.vars,MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED:'true'}},'readonly')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,ratelimits:[]},'readonly')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,workers_dev:false},'readonly')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1(disabled,'write')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,services:[]},'readonly')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,services:[{binding:'MEMBER_AUTH_SERVICE',service:'different'}]},'readonly')).toThrow();
  expect(()=>prepareAdminReadOnlyReleaseV1({...disabled,hyperdrive:[disabled.hyperdrive[0]]},'readonly')).toThrow();
 });
 it('verifies real release flag independently of the other three false flags',()=>{
  const live=bindings().map(b=>b.name==='MYEONGHA_ADMIN_PRIVATE_ENABLED'?{...b,text:'true'}:b);
  expect(inspectAdminReadOnlyReleaseV1(live,expected,'readonly')).toEqual({
    worker:'myeongha-admin',disabled:false,readOnly:true,
    originsVerified:true,memberVerificationKeyInstalled:true,
  });
  expect(()=>inspectAdminReadOnlyReleaseV1(bindings(),expected,'readonly')).toThrow();
  expect(()=>inspectAdminReadOnlyReleaseV1(live,expected,'disabled')).toThrow();
  expect(()=>inspectAdminReadOnlyReleaseV1(live.filter(b=>b.name!=='MEMBER_AUTH_SERVICE'),expected,'readonly')).toThrow();
  expect(()=>inspectAdminReadOnlyReleaseV1(live.map(b=>b.name==='MEMBER_AUTH_SERVICE'?{...b,service:'different'}:b),expected,'readonly')).toThrow();
  for(const name of ['MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED','MYEONGHA_ADMIN_RETENTION_ENABLED','MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED']){
    expect(()=>inspectAdminReadOnlyReleaseV1(live.map(b=>b.name===name?{...b,text:'true'}:b),expected,'readonly')).toThrow();
  }
 });
 it('reads remote settings only with a scoped GET and rejects failed readback',async()=>{
  let seen;
  const args={accountId:'c'.repeat(32),apiToken:'synthetic-token-not-secret',
    readHyperdriveId:expected.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
    auditHyperdriveId:expected.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID,mode:'readonly'};
  const actual=await verifyAdminReadOnlyReleaseV1({...args,async fetchImpl(url,options){
    seen={url,options};
    return {ok:true,async json(){return {success:true,result:{bindings:bindings().map(b=>
      b.name==='MYEONGHA_ADMIN_PRIVATE_ENABLED'?{...b,text:'true'}:b)}};}};
  }});
  expect(actual.readOnly).toBe(true);
  expect(seen.options.method).toBe('GET');
  expect(seen.options.redirect).toBe('error');
  expect(seen.url).toContain('/workers/scripts/myeongha-admin/settings');
  await expect(verifyAdminReadOnlyReleaseV1({...args,async fetchImpl(){return {ok:false};}})).rejects.toThrow();
 });
});
