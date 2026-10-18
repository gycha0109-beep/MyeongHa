/**
 * C08-W local filesystem evidence gate for C08-V's NON-BILLABLE mock.
 * It cannot authorize a paid request or provide a cross-run global ledger.
 * Reservation + directory entries are fsynced BEFORE the injected mock runs.
 */
import {constants} from 'node:fs';
import {mkdir,open,lstat,readdir,readFile} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P} from
 './seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const slots=P.caseIds.flatMap(caseId=>P.variants.map(variant=>
 Object.freeze({caseId,variant})));
const SCHEMA='seyeon-c08w-local-offline-fsync-journal-v1';
const maxEntries=1+slots.length*2;
const isUInt=x=>Number.isSafeInteger(x)&&x>=0;
const fileName=(i,kind)=>String(i+1).padStart(2,'0')+
 (kind==='mock_reservation'?'-reservation.json':'-observation.json');
const hold=()=>Error('C08W_LOCAL_OFFLINE_LEDGER_HOLD');
const manifest=Object.freeze({schemaVersion:SCHEMA,
 scope:'LOCAL_SYNTHETIC_MOCK_ONLY',
 crossRunGlobalDurabilityVerified:false,
 providerHardLimitVerified:false,
 invoiceReconciled:false,
 paidDispatchEnabled:false,
 productionPromotionPermitted:false,
 firstBatchSlots:6,
 reservedMicroUsd:19662});

function sanitizedEvent(item){
 if(!item||!isUInt(item.slotIndex)||item.slotIndex>=slots.length||
   !['mock_reservation','mock_observation'].includes(item.kind))
  throw hold();
 const slot=slots[item.slotIndex];
 if(item.caseId!==slot.caseId||item.variant!==slot.variant)
  throw hold();
 const row={kind:item.kind,slotIndex:item.slotIndex,
  caseId:slot.caseId,variant:slot.variant};
 if(item.kind==='mock_reservation'){
  if(item.reservedMicroUsd!==P.perCallReservedMicroUsd)
   throw hold();
  return {...row,reservedMicroUsd:P.perCallReservedMicroUsd};
 }
 if(!['BOUNDED_ESTIMATE','UNKNOWN_OUTCOME_HOLD'].includes(
   item.observation)||(
    item.observation==='BOUNDED_ESTIMATE'?
     !isUInt(item.estimatedMicroUsd)||
      item.estimatedMicroUsd>P.perCallReservedMicroUsd:
     item.estimatedMicroUsd!==null))
  throw hold();
 return {...row,observation:item.observation,
  estimatedMicroUsd:item.estimatedMicroUsd};
}

async function checkDirectory(dir){
 if(typeof dir!=='string'||!isAbsolute(dir))throw hold();
 const s=await lstat(dir);
 if(!s.isDirectory()||(s.mode&0o777)!==0o700||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))
  throw hold();
}
async function durableCreate(dir,name,record){
 const path=join(dir,name);
 // The O_EXCL+O_NOFOLLOW fence is intentionally never relaxed on restart.
 const fd=await open(path,constants.O_CREAT|constants.O_EXCL|
  constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 try{
  await fd.writeFile(JSON.stringify(record)+'\n','utf8');
  await fd.sync();
 }finally{await fd.close();}
 // Make the directory entry durable too; any failure is HOLD, not success.
 const dfd=await open(dir,constants.O_RDONLY|constants.O_DIRECTORY|
  constants.O_NOFOLLOW);
 try{await dfd.sync();}finally{await dfd.close();}
}
async function readRecord(dir,name){
 const p=join(dir,name),s=await lstat(p);
 if(!s.isFile()||(s.mode&0o777)!==0o600||s.size>2048)
  throw hold();
 const f=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return JSON.parse(await f.readFile('utf8'));}
 finally{await f.close();}
}

/**
 * A new directory is mandatory for the FIRST offline attempt. Re-entering
 * an existing directory, including a crashed or empty one, is refused.
 * Choosing a DIFFERENT directory can bypass this local guard, therefore it
 * MUST NEVER be used as the paid provider's global reservation authority.
 */
export async function createSeyeonC08WLocalOfflineJournalV1(dir){
 if(P.paidDispatchEnabled!==false||P.providerHardLimitVerified!==false||
    P.firstBatchReservedMicroUsd!==19662||
    P.maxFirstBatchCalls!==6||slots.length!==6||
    typeof dir!=='string'||!isAbsolute(dir))throw hold();
 await mkdir(dir,{recursive:false,mode:0o700});
 await checkDirectory(dir);
 await durableCreate(dir,'00-manifest.json',manifest);
 let nextSlot=0,expectKind='mock_reservation',halted=false;
 return Object.freeze({
  scope:'LOCAL_SYNTHETIC_MOCK_ONLY',
  paidDispatchEnabled:false,
  async journal(item){
   if(halted)throw hold();
   const e=sanitizedEvent(item);
   if(e.slotIndex!==nextSlot||e.kind!==expectKind)
    throw hold();
   try{await durableCreate(dir,fileName(nextSlot,e.kind),e);}
   catch(err){halted=true;throw err;}
   if(e.kind==='mock_reservation')expectKind='mock_observation';
   else{
    expectKind='mock_reservation';
    nextSlot++;
    if(e.observation!=='BOUNDED_ESTIMATE')halted=true;
   }
  },
 });
}

/** Read-only check: a partial or corrupted journal can NEVER be replayed. */
export async function auditSeyeonC08WLocalOfflineJournalV1(dir){
 await checkDirectory(dir);
 const files=(await readdir(dir)).sort();
 if(files.length>maxEntries||
    !files.includes('00-manifest.json'))throw hold();
 const m=await readRecord(dir,'00-manifest.json');
 if(JSON.stringify(m)!==JSON.stringify(manifest))throw hold();
 let position=0,observed=0,reserved=0,unknown=false;
 for(let i=0;i<slots.length;i++){
  const reserve=fileName(i,'mock_reservation');
  if(!files.includes(reserve))break;
  const a=await readRecord(dir,reserve);
  if(JSON.stringify(a)!==JSON.stringify(sanitizedEvent(a)))throw hold();
  reserved++;position++;
  const outcome=fileName(i,'mock_observation');
  if(!files.includes(outcome))break;
  const b=await readRecord(dir,outcome);
  if(JSON.stringify(b)!==JSON.stringify(sanitizedEvent(b)))throw hold();
  observed++;position++;
  if(b.observation!=='BOUNDED_ESTIMATE'){unknown=true;break;}
 }
 const expected=['00-manifest.json'];
 for(let i=0;i<slots.length;i++){
  if(expected.length-1>=position)break;
  expected.push(fileName(i,'mock_reservation'));
  if(expected.length-1>=position)break;
  expected.push(fileName(i,'mock_observation'));
 }
 if(files.join('|')!==expected.sort().join('|'))throw hold();
 return Object.freeze({scope:manifest.scope,
  status:'PAID_DISPATCH_HOLD',reserved,observed,
  interrupted:reserved!==6||observed!==6||unknown,
  mockEvidenceComplete:reserved===6&&observed===6&&!unknown,
  actualBilledKrw:null,invoiceReconciled:false,
  projectIdentityVerified:false,providerHardLimitVerified:false,
  globalCrossRunReservationVerified:false,
  paidDispatchEnabled:false});
}
