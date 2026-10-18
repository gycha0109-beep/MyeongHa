import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm,readdir,readFile,writeFile,stat,mkdir,symlink}
 from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {
 createSeyeonC08WLocalOfflineJournalV1 as createLedger,
 auditSeyeonC08WLocalOfflineJournalV1 as audit,
} from '../scripts/seyeon-cost-c08w-local-fsync-journal-v1.mjs';
import {runSeyeonC08VOfflineMockBatchV1 as run}
 from '../scripts/seyeon-cost-c08v-offline-once-pilot-v1.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P}
 from '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const ids=()=>{let n=0;return ()=>'00000000-0000-4000-8000-'+
 String(++n).padStart(12,'0');};
const model=async x=>({outcome:'response_received',
 inputTokens:1000,outputTokens:100,
 topicKey:x.expectedTopic,claimKinds:[...x.expectedKinds]});
const inTemp=async fn=>{
 const parent=await mkdtemp(join(tmpdir(),'seyeon-c08w-'));
 try{return await fn(join(parent,'journal'),parent);}
 finally{await rm(parent,{recursive:true,force:true});}
};

describe('C08-W fsync journal strictly local and non-billable',()=>{
 it('persistently journals all 6 synthetic mock slots before invocation, no prompts or secrets',async()=>inTemp(async dir=>{
  const ledger=await createLedger(dir);
  const mock=vi.fn(model);
  const result=await run({mockProvider:mock,
   journal:x=>ledger.journal(x),callIdFactory:ids()});
  expect(result).toMatchObject({mockComplete:true,paidDispatchEnabled:false});
  expect(mock).toHaveBeenCalledTimes(6);
  expect(await audit(dir)).toMatchObject({
   status:'PAID_DISPATCH_HOLD',reserved:6,observed:6,
   interrupted:false,mockEvidenceComplete:true,
   actualBilledKrw:null,globalCrossRunReservationVerified:false,
   paidDispatchEnabled:false});
  const files=await readdir(dir);
  expect(files).toHaveLength(13);
  for(const name of files){
   const s=await stat(join(dir,name));
   expect(s.mode&0o777).toBe(0o600);
   const text=await readFile(join(dir,name),'utf8');
   expect(text).not.toContain('syntheticText');
   expect(text).not.toContain('AUTHORITY_OVERRIDE');
   expect(text).not.toContain('우리 지난주 제주도');
   expect(text).not.toContain('OPENAI_EVAL_API_KEY');
  }
  expect((await stat(dir)).mode&0o777).toBe(0o700);
 }));
 it('keeps a reservation if a mock crashes, never retries or accepts the same local directory',async()=>inTemp(async dir=>{
  const ledger=await createLedger(dir);
  const mock=vi.fn().mockRejectedValue(Error('mock outcome unknown'));
  const result=await run({mockProvider:mock,
   journal:ledger.journal,callIdFactory:ids()});
  expect(result.stopReason).toBe('UNKNOWN_MOCK_OUTCOME_HOLD');
  expect(mock).toHaveBeenCalledTimes(1);
  expect(await audit(dir)).toMatchObject({
   reserved:1,observed:0,interrupted:true,
   mockEvidenceComplete:false,paidDispatchEnabled:false});
  await expect(createLedger(dir)).rejects.toThrow();
 }));
 it('makes a lost journal observation fail closed with no second mock',async()=>inTemp(async dir=>{
  const ledger=await createLedger(dir);
  const mock=vi.fn(model);
  const result=await run({mockProvider:mock,
   journal:async x=>{
    if(x.kind==='mock_observation')throw Error('I/O lost');
    await ledger.journal(x);
   },callIdFactory:ids()});
  expect(result.stopReason).toBe('OUTCOME_JOURNAL_HOLD');
  expect(mock).toHaveBeenCalledTimes(1);
  expect(await audit(dir)).toMatchObject({reserved:1,observed:0,
   interrupted:true,paidDispatchEnabled:false});
 }));
 it('stops after unknown usage; never writes any later reservation',async()=>inTemp(async dir=>{
  const ledger=await createLedger(dir);
  const mock=vi.fn(async()=>({outcome:'network_error',inputTokens:1,outputTokens:1}));
  const result=await run({mockProvider:mock,
   journal:ledger.journal,callIdFactory:ids()});
  expect(result.stopReason).toBe('UNKNOWN_USAGE_HOLD');
  expect(mock).toHaveBeenCalledTimes(1);
  expect(await audit(dir)).toMatchObject({reserved:1,observed:1,
   interrupted:true,mockEvidenceComplete:false});
 }));
 it('rejects pre-existing, symlinked or already-claimed journal roots',async()=>inTemp(async(dir,parent)=>{
  await mkdir(dir);
  await expect(createLedger(dir)).rejects.toThrow();
  await rm(dir,{recursive:true});
  await symlink(parent,dir,'dir');
  await expect(createLedger(dir)).rejects.toThrow();
 }));
 it('detects unknown files, tampering and missing manifest, never infers billing status',async()=>inTemp(async dir=>{
  const ledger=await createLedger(dir);
  await ledger.journal({kind:'mock_reservation',slotIndex:0,
   caseId:P.caseIds[0],variant:P.variants[0],
   reservedMicroUsd:P.perCallReservedMicroUsd});
  const name='01-reservation.json';
  const before=JSON.parse(await readFile(join(dir,name),'utf8'));
  await writeFile(join(dir,name),JSON.stringify({...before,
   reservedMicroUsd:0})+'\n');
  await expect(audit(dir)).rejects.toThrow(/HOLD/);
  await writeFile(join(dir,name),JSON.stringify(before)+'\n');
  await writeFile(join(dir,'extra.json'),'{}\n',{mode:0o600});
  await expect(audit(dir)).rejects.toThrow(/HOLD/);
 }));
 it('two simultaneous initializations have exactly one success for one root',async()=>inTemp(async dir=>{
  const outcomes=await Promise.allSettled([createLedger(dir),createLedger(dir)]);
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await audit(dir)).toMatchObject({reserved:0,observed:0,
   interrupted:true});
 }));
 it('contains no paid network path; local-only cannot prove global run uniqueness or provider hard cap',()=>{
  const code=readFileSync(new URL(
   '../scripts/seyeon-cost-c08w-local-fsync-journal-v1.mjs',
   import.meta.url),'utf8');
  expect(code).not.toMatch(/api\.openai\.com|secrets\.OPENAI_|fetch\(/);
  expect(P.paidDispatchEnabled).toBe(false);
 });
});
