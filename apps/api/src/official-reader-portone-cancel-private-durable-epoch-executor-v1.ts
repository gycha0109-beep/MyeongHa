/**
 * D3e17 OFFLINE/SANDBOX ONLY: restart-persistent epoch watermark prototype.
 *
 * A *separately provisioned* initial state and an independently protected,
 * LINEARIZABLE, durable transaction store are mandatory. Missing/corrupt
 * state is NEVER silently rebuilt. Every signed source observation must
 * advance/check the shared watermark DURABLY before D3e16 proceeds.
 *
 * Store callbacks and this module are NOT an independent trust boundary:
 * an attacker who can reset/roll back the store or inject a new store/root
 * at bootstrap can bypass this prototype. Physical anti-rollback storage,
 * separate service credentials and DB-atomic execution are D3e18/19 blockers.
 */
import {createHash,createPublicKey} from 'node:crypto';
import {
  verifyPrivateCancelSignedExecutionEpochV1,
  type PrivateCancelTrustedEpochSignerV1,
  type PrivateCancelVerifiedEpochV1,
} from './official-reader-portone-cancel-private-execution-epoch-v1.js';
import {
  createOfflinePrivateCancelRevocationFencedExecutorV1,
  type PrivateCancelRevocationFencedExecutorV1,
} from './official-reader-portone-cancel-private-epoch-fenced-executor-v1.js';
import type {
  PrivateCancelSignedTrustPolicyV1,PrivateCancelTrustedRootV1,
} from './official-reader-portone-cancel-private-signed-trust-policy-v1.js';
import type {PrivateCancelReviewAuthorizedStoreV1} from
  './official-reader-portone-cancel-private-dual-approval-v1.js';

export type PrivateCancelDurableEpochWatermarkV1=Readonly<{
  schema:'myeongha.cancel.ops.durable-epoch-watermark.v1';
  sequence:number;
  fingerprint:string;
  policyRevision:number;
  policyDigest:string;
  rootKeyId:string;
  policyId:string;
  signerFingerprint:string;
  status:'active'|'halted';
  observedAt:string;
}>;

/**
 * MUST be a real single-writer/serializable transaction with durable commit
 * BEFORE resolve. It MUST use the state held by the external store, not a
 * caller-provided value. Callback is invoked exactly once under a lock.
 * On throw the transaction is aborted. No reset/initialize on missing state.
 *
 * The D3e17 fixture simulates this contract; it does NOT prove an actual
 * database/HSM/independent storage process implements it.
 */
export type PrivateCancelTrustedDurableEpochStoreV1=Readonly<{
  transact(
    update:(previous:unknown)=>PrivateCancelDurableEpochWatermarkV1,
  ):Promise<unknown>;
}>;

const SCHEMA='myeongha.cancel.ops.durable-epoch-watermark.v1';
const KEYS=[
  'schema','sequence','fingerprint','policyRevision','policyDigest',
  'rootKeyId','policyId','signerFingerprint','status','observedAt',
];
const SHA=/^[a-f0-9]{64}$/u;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;
const ROOT=/^root_[a-z0-9_]{6,32}$/u;
const POLICY=/^policy_[a-z0-9_]{6,32}$/u;
function timestamp(s:unknown):s is string{
  return typeof s==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(s)
    && Number.isFinite(Date.parse(s))
    && new Date(Date.parse(s)).toISOString()===s;
}
function validState(value:unknown):value is PrivateCancelDurableEpochWatermarkV1{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const o=value as Record<string,unknown>;
  if(JSON.stringify(Object.keys(o).sort())!==JSON.stringify([...KEYS].sort())
    ||o.schema!==SCHEMA||!Number.isSafeInteger(o.sequence)
    ||(o.sequence as number)<0||!timestamp(o.observedAt)
    ||(o.status!=='active'&&o.status!=='halted'))return false;
  if(o.sequence===0){
    return o.fingerprint===''&&o.policyRevision===0
      &&o.policyDigest===''&&o.rootKeyId===''&&o.policyId===''
      &&o.signerFingerprint===''&&o.status==='active';
  }
  return typeof o.fingerprint==='string'&&SHA.test(o.fingerprint)
    &&Number.isSafeInteger(o.policyRevision)&&(o.policyRevision as number)>0
    &&typeof o.policyDigest==='string'&&DIGEST.test(o.policyDigest)
    &&typeof o.rootKeyId==='string'&&ROOT.test(o.rootKeyId)
    &&typeof o.policyId==='string'&&POLICY.test(o.policyId)
    &&typeof o.signerFingerprint==='string'&&SHA.test(o.signerFingerprint);
}

/** Used ONLY by the separately approved offline fixture provisioner.
 * The executor intentionally has no create-if-missing / reset operation.
 */
export function offlinePrivateCancelDurableEpochGenesisFixtureV1():
  PrivateCancelDurableEpochWatermarkV1{
  return Object.freeze({
    schema:SCHEMA,sequence:0,fingerprint:'',policyRevision:0,
    policyDigest:'',rootKeyId:'',policyId:'',signerFingerprint:'',
    status:'active',observedAt:'1970-01-01T00:00:00.000Z',
  });
}

function signerFingerprint(pin:PrivateCancelTrustedEpochSignerV1):string{
  const der=createPublicKey(pin.publicKeyPem).export({type:'spki',format:'der'});
  return createHash('sha256').update(pin.keyId,'utf8')
    .update(Buffer.from([0])).update(der).digest('hex');
}

/** Deterministic state transition; requires the trusted store's serialized
 * transaction for actual multi-instance exclusion.
 */
export function advanceOfflinePrivateCancelDurableEpochV1(
  previous:unknown,
  verified:PrivateCancelVerifiedEpochV1,
  pinnedSignerFingerprint:string,
  observedAt:string,
):PrivateCancelDurableEpochWatermarkV1{
  if(!validState(previous)){
    throw new Error('Offline cancel durable epoch state missing or corrupt: HALT.');
  }
  if(!timestamp(observedAt)||!SHA.test(pinnedSignerFingerprint)){
    throw new Error('Offline cancel durable epoch trusted clock/signer invalid.');
  }
  if(Date.parse(observedAt)<Date.parse(previous.observedAt)){
    throw new Error('Offline cancel durable epoch clock rollback: DENY.');
  }
  if(previous.status==='halted'){
    throw new Error('Offline cancel durable epoch globally HALTED.');
  }
  if(previous.sequence>0&&previous.signerFingerprint!==pinnedSignerFingerprint){
    throw new Error('Offline cancel durable epoch signer rotation requires separate approval.');
  }

  const next:PrivateCancelDurableEpochWatermarkV1={
    schema:SCHEMA,sequence:verified.sequence,
    fingerprint:verified.fingerprint,
    policyRevision:verified.policyContext.revision,
    policyDigest:verified.policyContext.policyDigest,
    rootKeyId:verified.policyContext.rootKeyId,
    policyId:verified.policyContext.policyId,
    signerFingerprint:pinnedSignerFingerprint,
    status:verified.status,observedAt,
  };
  if(previous.sequence>verified.sequence){
    throw new Error('Offline cancel durable epoch rollback: DENY.');
  }
  // Signed equivocation or a policy-revision regression is a GLOBAL latch.
  // Store the HALT before the request is rejected.
  if(previous.sequence>0&&(
    (previous.sequence===verified.sequence&&(
      previous.fingerprint!==verified.fingerprint
      ||previous.policyDigest!==next.policyDigest
      ||previous.rootKeyId!==next.rootKeyId
      ||previous.policyId!==next.policyId
      ||previous.policyRevision!==next.policyRevision
    ))
    ||verified.policyContext.revision<previous.policyRevision
  )){
    return Object.freeze({...previous,status:'halted',observedAt});
  }
  if(previous.sequence===verified.sequence){
    return Object.freeze({...previous,observedAt});
  }
  return Object.freeze(next);
}

/** Wrapping ONLY the D3e16 offline factory preserves its two-check gate.
 * Every read additionally consults the same external durable watermark.
 */
export async function createOfflinePrivateCancelDurableEpochExecutorV1(
  input:Readonly<{
    signedPolicy:PrivateCancelSignedTrustPolicyV1;
    pinnedRoot:PrivateCancelTrustedRootV1;
    pinnedEpochSigner:PrivateCancelTrustedEpochSignerV1;
    readCurrentEpoch:()=>Promise<unknown>;
    durableStore:PrivateCancelTrustedDurableEpochStoreV1;
    trustedClock:()=>Date;
    testStore:PrivateCancelReviewAuthorizedStoreV1;
  }>,
):Promise<PrivateCancelRevocationFencedExecutorV1>{
  if(typeof input?.readCurrentEpoch!=='function'
    ||typeof input?.trustedClock!=='function'
    ||typeof input?.durableStore?.transact!=='function'){
    throw new Error('Offline cancel durable executor requires separately trusted boot dependencies.');
  }
  // Never inspect a caller-supplied request for the store, clock or trust key.
  const trustedSource=input.readCurrentEpoch;
  const durable=input.durableStore;
  const clock=input.trustedClock;
  let signerHash:string;
  try{signerHash=signerFingerprint(input.pinnedEpochSigner);}
  catch{throw new Error('Offline cancel durable epoch invalid pinned signer.');}
  const source=async():Promise<unknown>=>{
    const envelope=await trustedSource();
    const now=clock();
    // Verified independently here, then D3e16 validates AGAIN after read.
    const verified=verifyPrivateCancelSignedExecutionEpochV1({
      envelope,pinnedSigner:input.pinnedEpochSigner,now,
    });
    let proposed:PrivateCancelDurableEpochWatermarkV1|undefined;
    let committed:unknown;
    try{
      committed=await durable.transact(previous=>{
        proposed=advanceOfflinePrivateCancelDurableEpochV1(
          previous,verified,signerHash,now.toISOString(),
        );
        return proposed;
      });
    }catch{
      throw new Error('Offline cancel durable epoch read/write unavailable or invalid: DENY.');
    }
    // Reject unreliable read-back and a HALT even when the write committed.
    if(!proposed||!validState(committed)
      ||JSON.stringify(committed)!==JSON.stringify(proposed)){
      throw new Error('Offline cancel durable epoch commit read-back invalid: DENY.');
    }
    if(committed.status==='halted'){
      throw new Error('Offline cancel durable epoch globally HALTED.');
    }
    return envelope;
  };
  return createOfflinePrivateCancelRevocationFencedExecutorV1({
    signedPolicy:input.signedPolicy,pinnedRoot:input.pinnedRoot,
    pinnedEpochSigner:input.pinnedEpochSigner,readCurrentEpoch:source,
    trustedClock:clock,testStore:input.testStore,
  });
}
