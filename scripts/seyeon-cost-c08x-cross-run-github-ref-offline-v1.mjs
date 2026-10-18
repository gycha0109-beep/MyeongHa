/**
 * C08-X: offline-only simulator for a GitHub create-ref once reservation.
 * NO GitHub credentials, network transport, live refs, provider HTTP or paid calls.
 * A real GitHub ref can be rewritten/deleted: this cannot grant paid admission.
 */
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P}
 from './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const ROOT='refs/heads/seyeon-c08x-offline-first-six-v1';
const REPO='gycha0109-beep/MyeongHa';
const slots=P.caseIds.flatMap(caseId=>P.variants.map(variant=>
 Object.freeze({caseId,variant})));
const FAKE_STORES=new WeakSet();
const shaPattern=/^[0-9a-f]{40}$/u;
const runPattern=/^[1-9][0-9]*$/u;
const hold=()=>Error('C08X_SHARED_REF_SIMULATION_HOLD');
const refs=Object.freeze({
 batch:ROOT+'/batch',
 slots:Object.freeze(slots.map((s,i)=>ROOT+'/slot-'+
  String(i+1).padStart(2,'0'))),
});
const cloneRecord=(ref,sha)=>({ref,object:{type:'commit',sha}});
const assertResponse=(x,code,ref,sha)=>{
 if(!x||x.status!==code||x.body?.ref!==ref||
    x.body?.object?.type!=='commit'||x.body?.object?.sha!==sha)
  throw hold();
};
const pinnedPolicy=()=>P.paidDispatchEnabled===false&&
 P.providerHardLimitVerified===false&&
 P.maxFirstBatchCalls===6&&P.firstBatchReservedMicroUsd===19662&&
 P.additionalBudgetKrw===5000&&slots.length===6&&
 P.caseIds.join(',')==='A01,H01,C02_mixed-admin-private_01'&&
 P.variants.join(',')==='original,compact';

/**
 * Two independently constructed gates may share this ONE fake store.
 * Fake atomics are intentionally synchronous before any async fault injection.
 * Fault injection permits modeling a server write succeeded but ACK was lost.
 */
export function createSeyeonC08XOfflineFakeRefStoreV1({failure}={}){
 const refMap=new Map();
 let requests=0;
 const backend=Object.freeze({
  async createReference({repository,ref,sha}){
   requests++;
   if(repository!==REPO||typeof ref!=='string'||
      !(ref===refs.batch||refs.slots.includes(ref))||
      !shaPattern.test(sha))throw hold();
   if(failure?.phase==='before_create')throw hold();
   if(refMap.has(ref))return {status:422,body:{message:'already exists'}};
   refMap.set(ref,sha);
   if(failure?.phase==='after_create')throw hold();
   return {status:201,body:cloneRecord(ref,sha)};
  },
  async readReference({repository,ref}){
   if(repository!==REPO)throw hold();
   if(failure?.phase==='readback')throw hold();
   const sha=refMap.get(ref);
   return sha?{status:200,body:cloneRecord(ref,sha)}:{status:404};
  },
  /** For adversarial tests, never a production GitHub adapter. */
  simulationInspect(){return Object.freeze({
   refs:Object.freeze([...refMap.keys()]),requests});},
  simulationRewrite(ref,sha){refMap.set(ref,sha);},
  simulationRemove(ref){refMap.delete(ref);},
 });
 FAKE_STORES.add(backend);
 return backend;
}

function assertAdmission(admission){
 if(!admission||admission.scope!=='OFFLINE_ONLY'||
   admission.paidDispatchEnabled!==false||
   !runPattern.test(String(admission.runId))||
   !shaPattern.test(String(admission.exactMainSha)))
  throw hold();
}

/**
 * The admission is evidence from the C08-V unique run check, but the fake
 * remote does NOT independently verify GitHub action history or the SHA.
 * No real network backend is accepted, including a caller-built adapter.
 */
export function createSeyeonC08XOfflineRefGateV1({backend,admission}={}){
 if(!pinnedPolicy()||!FAKE_STORES.has(backend))throw hold();
 assertAdmission(admission);
 let phase='UNCLAIMED',index=0;
 const checkRef=async ref=>{
  const read=await backend.readReference({repository:REPO,ref});
  assertResponse(read,200,ref,admission.exactMainSha);
 };
 const verifyPrior=async()=>{
  await checkRef(refs.batch);
  for(let i=0;i<index;i++)await checkRef(refs.slots[i]);
 };
 const createAndReadOnce=async ref=>{
  // Exactly ONE CREATE, no retry even when ACK is unknown.
  const created=await backend.createReference({
   repository:REPO,ref,sha:admission.exactMainSha});
  assertResponse(created,201,ref,admission.exactMainSha);
  await checkRef(ref);
 };
 return Object.freeze({
  scope:'C08X_FAKE_SHARED_REF_ONLY',
  paidDispatchEnabled:false,
  async claimBatch(){
   if(phase!=='UNCLAIMED')throw hold();
   phase='HALTED';
   await createAndReadOnce(refs.batch);
   phase='RESERVING';
   return Object.freeze({scope:'OFFLINE_ONLY',
    paidDispatchEnabled:false,globalCrossRunReservationVerified:false});
  },
  async journal(event){
   if(phase==='UNCLAIMED'||phase==='HALTED'||
      index>=slots.length||!event||
      event.caseId!==slots[index].caseId||
      event.variant!==slots[index].variant||
      event.slotIndex!==index)throw hold();
   if(phase==='RESERVING'){
    if(event.kind!=='mock_reservation'||
       event.reservedMicroUsd!==P.perCallReservedMicroUsd)throw hold();
    phase='HALTED';
    await verifyPrior();
    await createAndReadOnce(refs.slots[index]);
    phase='OBSERVING';
    return;
   }
   if(phase!=='OBSERVING'||event.kind!=='mock_observation'||
     event.observation!=='BOUNDED_ESTIMATE'||
     !Number.isSafeInteger(event.estimatedMicroUsd)||
     event.estimatedMicroUsd<0||
     event.estimatedMicroUsd>P.perCallReservedMicroUsd){
    phase='HALTED';throw hold();
   }
   phase='HALTED';
   await verifyPrior();
   await checkRef(refs.slots[index]);
   index++;
   phase=index===slots.length?'FINISHED':'RESERVING';
  },
  snapshot(){
   return Object.freeze({
    status:'PAID_DISPATCH_HOLD',
    scope:'C08X_FAKE_SHARED_REF_ONLY',
    claimed:phase!=='UNCLAIMED',
    simulatedSlotsReserved:phase==='UNCLAIMED'?0:
      (phase==='OBSERVING'?index+1:index),
    simulatedSlotsObserved:index,
    mockComplete:phase==='FINISHED',
    providerHardLimitVerified:false,
    invoiceReconciled:false,
    globalCrossRunReservationVerified:false,
    actualBilledKrw:null,
    paidDispatchEnabled:false,
   });
  },
 });
}
