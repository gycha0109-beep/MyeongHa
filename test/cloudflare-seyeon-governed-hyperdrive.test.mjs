import{beforeEach,describe,expect,it,vi}from'vitest';
const state=vi.hoisted(()=>({pools:[],wrongPrincipal:false,ordinaryBypass:false,ordinaryGovernedMembership:false,ordinaryOwnerMembership:false,ordinaryDirectLedger:false,ordinaryInternalStart:false,executorDirectLedger:false,ordinaryDirectLedgerColumns:false,executorDirectLedgerColumns:false}));
vi.mock('pg',()=>({Pool:class{
 constructor(config){this.config=config;this.calls=[];this.releases=[];this.ended=false;state.pools.push(this);}
 on(){}async end(){this.ended=true;}
 async connect(){return{query:async(sql)=>{this.calls.push(sql);
  if(sql.includes('session_user'))return{rows:[{sessionUser:state.wrongPrincipal?'myeongha_cf_hyperdrive_login':'myeongha_seyeon_governed_login',currentUser:'myeongha_seyeon_governed_login',canLogin:true,isSuper:false,canBypassRls:false,canInherit:false,canCreateDb:false,canCreateRole:false,hasGovernedRoleMembership:true,isLegacyMember:false,isCostOwnerMember:false,otherMemberships:0,canLegacyStart:false,canLegacySettle:false,canLegacyRecord:false,canOrdinaryLegacyStart:false,canOrdinaryLegacySettle:false,canOrdinaryLegacyRecord:false,canOrdinaryGovernedStart:state.ordinaryBypass,canOrdinaryGovernedSettle:false,canOrdinaryStoreReceipt:false,canOrdinaryInternalStart:state.ordinaryInternalStart,canOrdinaryInternalSettle:false,ordinaryIsGovernedRoleMember:state.ordinaryGovernedMembership,ordinaryIsCostOwnerMember:state.ordinaryOwnerMembership,canOrdinaryDirectLedger:state.ordinaryDirectLedger,canOrdinaryDirectBudget:false,canOrdinaryDirectRateCard:false,canOrdinaryDirectLedgerColumns:state.ordinaryDirectLedgerColumns,canOrdinaryDirectBudgetColumns:false,canOrdinaryDirectRateCardColumns:false,canDirectLedger:false,canDirectBudget:false,canDirectRateCard:false,canDirectLedgerColumns:false,canDirectBudgetColumns:false,canDirectRateCardColumns:false,executorCanLogin:false,executorIsSuper:false,executorCanBypassRls:false,executorCanInherit:false,executorCanCreateDb:false,executorCanCreateRole:false,executorCanReplicate:false,executorOtherMemberships:0,executorCanUsePublicSchema:true,executorCanCreatePublicSchema:false,executorCanResolveSubject:true,executorCanAssertSubject:true,executorCanBeginMemberContext:true,executorCanBeginGuestContext:false,executorCanBeginGovernedGuestContext:true,executorCanGovernedStart:true,executorCanGovernedSettle:true,executorCanStoreProviderReceipt:true,executorCanLegacyStart:false,executorCanLegacySettle:false,executorCanLegacyRecord:false,executorCanInternalStart:false,executorCanInternalSettle:false,executorCanReadCost:false,executorCanClaimProviderReceipt:false,executorCanAckProviderReceipt:false,executorDirectLedger:state.executorDirectLedger,executorDirectBudget:false,executorDirectRateCard:false,executorDirectReceiptQueue:false,executorDirectLedgerColumns:state.executorDirectLedgerColumns,executorDirectBudgetColumns:false,executorDirectRateCardColumns:false,executorDirectReceiptQueueColumns:false}]};
  if(sql==='select current_user::text as "currentUser"')return{rows:[{currentUser:'myeongha_seyeon_governed_executor'}]};
  return{rows:[]};},release:error=>this.releases.push(error)};}
}}));
import{createCloudflareSeyeonSubjectPoolV1,createCloudflareSeyeonGovernedPoolV1,createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1}from'../workers/cloudflare-hyperdrive-subject-pool.mjs';
const bindings=()=>({MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT:'approved-supabase-hyperdrive-v1',
 MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY:'supabase-verify-full-rls-v1',
 MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL:'myeongha_cf_hyperdrive_login',
 SEYEON_SUBJECT_HYPERDRIVE:{connectionString:'postgresql://fixture:placeholder@ordinary-binding.local/postgres'},
 SEYEON_GOVERNED_HYPERDRIVE:{connectionString:'postgresql://fixture:placeholder@governed-binding.local/postgres'}});
beforeEach(()=>{state.pools.length=0;state.wrongPrincipal=false;state.ordinaryBypass=false;state.ordinaryGovernedMembership=false;state.ordinaryOwnerMembership=false;state.ordinaryDirectLedger=false;state.ordinaryInternalStart=false;state.executorDirectLedger=false;state.ordinaryDirectLedgerColumns=false;state.executorDirectLedgerColumns=false;});
describe('separate Cloudflare subject and governed cost bindings',()=>{
 it('rejects missing, reused or unapproved bindings without acquiring a SQL connection',()=>{
  const b=bindings();for(const bad of [{...b,SEYEON_GOVERNED_HYPERDRIVE:undefined},{...b,SEYEON_GOVERNED_HYPERDRIVE:b.SEYEON_SUBJECT_HYPERDRIVE},{...b,SEYEON_SUBJECT_HYPERDRIVE:undefined}])expect(()=>createCloudflareSeyeonGovernedPoolV1(bad)).toThrow();
  expect(state.pools).toHaveLength(0);
 });
 it('keeps S0 withdrawal and issued-response receipt runnable without any governed cost binding',async()=>{
  const b=bindings();
  const privacy=createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1({
    ...b,SEYEON_GOVERNED_HYPERDRIVE:undefined,
  });
  expect(state.pools).toHaveLength(1);
  expect(state.pools[0].config.connectionString).toBe(b.SEYEON_SUBJECT_HYPERDRIVE.connectionString);
  expect(state.pools[0].config.max).toBe(1);
  await privacy.close();
  expect(state.pools[0].ended).toBe(true);
  expect(()=>createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1({
    ...b,SEYEON_GOVERNED_HYPERDRIVE:b.SEYEON_SUBJECT_HYPERDRIVE,
  })).toThrow();
  expect(state.pools).toHaveLength(1);
 });
 it('uses distinct request-owned max-one pools and proves the governed role before exposing a connection',async()=>{
  const b=bindings();const ordinary=createCloudflareSeyeonSubjectPoolV1(b);
  const governed=createCloudflareSeyeonGovernedPoolV1(b);const client=await governed.connect();
  expect(state.pools).toHaveLength(2);expect(state.pools.map(p=>p.config.max)).toEqual([1,1]);
  expect(state.pools[0].config.connectionString).not.toBe(state.pools[1].config.connectionString);
  expect(state.pools[1].calls).toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
  expect(state.pools[1].calls).not.toContain('SET LOCAL ROLE myeongha_api_executor');
  client.release();await ordinary.close();await governed.close();expect(state.pools.every(p=>p.ended)).toBe(true);
 });
 it('W117 rejects ordinary-account governed Start bypass before the role switch',async()=>{
  state.ordinaryBypass=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
  expect(state.pools[0].releases).toHaveLength(1);
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
 it('W118 rejects NOINHERIT ordinary memberships in either private role before role switch',async()=>{
  for(const key of ['ordinaryGovernedMembership','ordinaryOwnerMembership']){
   state[key]=true;
   const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
   await expect(pool.connect()).rejects.toThrow();
   expect(state.pools.at(-1).calls).not.toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
   expect(state.pools.at(-1).releases).toHaveLength(1);
   expect(state.pools.at(-1).releases[0]).toBeInstanceOf(Error);
   await pool.close();
   state[key]=false;
  }
 });
 it('W119 rejects direct ledger-table access by the ordinary API role before role switch',async()=>{
  state.ordinaryDirectLedger=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
  expect(state.pools[0].releases).toHaveLength(1);
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
 it('W120 rejects direct access to private budget ledger helpers before role switch',async()=>{
  state.ordinaryInternalStart=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
  expect(state.pools[0].releases).toHaveLength(1);
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
 it('W121 rejects direct table privileges on the governed executor before role switch',async()=>{
  state.executorDirectLedger=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('BEGIN');
  expect(state.pools[0].releases).toHaveLength(1);
  expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
 it('W121 rejects column-level executor ledger grants before role switch',async()=>{
  state.executorDirectLedgerColumns=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('BEGIN');
  expect(state.pools[0].releases).toHaveLength(1);
  await pool.close();
 });
 it('W121 rejects column-level ordinary API ledger grants before role switch',async()=>{
  state.ordinaryDirectLedgerColumns=true;
  const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('BEGIN');
  expect(state.pools[0].releases).toHaveLength(1);
  await pool.close();
 });
 it('discards an accidental ordinary credential before governed role entry',async()=>{
  state.wrongPrincipal=true;const pool=createCloudflareSeyeonGovernedPoolV1(bindings());
  await expect(pool.connect()).rejects.toThrow();
  expect(state.pools[0].calls).not.toContain('SET LOCAL ROLE myeongha_seyeon_governed_executor');
  expect(state.pools[0].releases).toHaveLength(1);expect(state.pools[0].releases[0]).toBeInstanceOf(Error);
  await pool.close();
 });
});
