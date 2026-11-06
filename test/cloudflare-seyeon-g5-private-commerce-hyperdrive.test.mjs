import{beforeEach,describe,expect,it,vi}from'vitest';
const state=vi.hoisted(()=>({pools:[],wrongLogin:false,wrongRole:false}));
vi.mock('pg',()=>({Pool:class{
 constructor(config){this.config=config;this.calls=[];this.releases=[];this.ended=false;state.pools.push(this);}
 on(){}
 async end(){this.ended=true;}
 async connect(){return{query:async(sql)=>{
  this.calls.push(sql);
  if(sql.includes('select current_user::text as "effectiveRole"'))return{rows:[{
   effectiveRole:state.wrongRole?'myeongha_api_executor':'myeongha_commerce_internal_executor',
   canSettle:true,canCatalog:true,canDirectLedgerUpdate:false,
  }]};
  if(sql.includes('session_user'))return{rows:[{
   sessionUser:state.wrongLogin?'myeongha_seyeon_subject_login':'myeongha_seyeon_g5_commerce_login',
   currentUser:'myeongha_seyeon_g5_commerce_login',
   canLogin:true,canInherit:false,isSuper:false,canBypassRls:false,
   canCreateDb:false,canCreateRole:false,credentialUnexpired:true,
   membershipCount:1,directCommerceMembershipCount:1,commerceMember:true,
   apiMember:false,directSettle:false,directCatalog:false,directLedgerUpdate:false,
  }]};
  return{rows:[]};
 },release:error=>this.releases.push(error)};}
}}));
import{createCloudflareSeyeonG5PrivateCommercePoolV1}from'../workers/cloudflare-hyperdrive-subject-pool.mjs';

const host='aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';
const scheme='postgresql:'+'/';
const connection=(user,password)=>[scheme,'/',user,':',password,'@',host].join('');
const subject=connection('myeongha_seyeon_subject_login','fixture-a');
const governed=connection('myeongha_seyeon_governed_login','fixture-b');
const commerce=connection('myeongha_seyeon_g5_commerce_login.cnsfpcdiyofqvhpcegfc','fixture-c');
const bindings=()=>({
 SEYEON_SUBJECT_HYPERDRIVE:{connectionString:subject},
 SEYEON_GOVERNED_HYPERDRIVE:{connectionString:governed},
 SEYEON_G5_COMMERCE_HYPERDRIVE:{connectionString:commerce},
 SEYEON_G5_COMMERCE_HYPERDRIVE_ORIGIN_POLICY:'supabase-verify-full-rls-v1',
 SEYEON_G5_COMMERCE_HYPERDRIVE_PRINCIPAL:'myeongha_seyeon_g5_commerce_login',
});
beforeEach(()=>{state.pools.length=0;state.wrongLogin=false;state.wrongRole=false;});
describe('G5 dedicated Cloudflare Commerce Hyperdrive',()=>{
 it('rejects absent, reused or wrong-principal bindings before creating a pool',()=>{
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE:undefined,
  })).toThrow();
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE:{connectionString:subject},
  })).toThrow();
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE:{connectionString:governed},
  })).toThrow();
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE:{connectionString:commerce.replace('myeongha_seyeon_g5_commerce_login','myeongha_seyeon_subject_login')},
  })).toThrow();
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE_ORIGIN_POLICY:'verify-ca',
  })).toThrow();
  expect(()=>createCloudflareSeyeonG5PrivateCommercePoolV1({
   ...bindings(),SEYEON_G5_COMMERCE_HYPERDRIVE_PRINCIPAL:'myeongha_api_executor',
  })).toThrow();
  expect(state.pools).toHaveLength(0);
 });
 it('keeps proof settlement independent from the governed model-cost Hyperdrive',async()=>{
  const receiptBindings=bindings();
  delete receiptBindings.SEYEON_GOVERNED_HYPERDRIVE;
  const pool=createCloudflareSeyeonG5PrivateCommercePoolV1(receiptBindings);
  expect(state.pools).toHaveLength(1);
  await pool.close();
 });
 it('uses a third max-one pool and proves dedicated LOGIN plus private role on every checkout',async()=>{
  const pool=createCloudflareSeyeonG5PrivateCommercePoolV1(bindings());
  expect(state.pools).toHaveLength(1);
  expect(state.pools[0].config.connectionString).toBe(commerce);
  expect(state.pools[0].config.max).toBe(1);
  const client=await pool.connect();
  await client.query('select 1');
  client.release();
  expect(state.pools[0].calls.slice(0,5)).toEqual([
   expect.stringContaining('session_user'),
   'BEGIN',
   'SET LOCAL ROLE myeongha_commerce_internal_executor',
   expect.stringContaining('effectiveRole'),
   'ROLLBACK',
  ]);
  expect(state.pools[0].calls).not.toContain('SET LOCAL ROLE myeongha_api_executor');
  await pool.close();
  expect(state.pools[0].ended).toBe(true);
 });
 it('rejects a wrong physical login before opening a transaction',async()=>{
  state.wrongLogin=true;
  const pool=createCloudflareSeyeonG5PrivateCommercePoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).toHaveLength(1);
  expect(state.pools[0].calls[0]).toContain('session_user');
  expect(state.pools[0].calls).not.toContain('BEGIN');
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
 it('rolls back and discards a connection when the private role proof fails',async()=>{
  state.wrongRole=true;
  const pool=createCloudflareSeyeonG5PrivateCommercePoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls.slice(-1)).toEqual(['ROLLBACK']);
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
});
