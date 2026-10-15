/**
 * PRIVATE/OFFLINE ONLY: strict persistent execution policy watermark contract.
 *
 * A trusted, independently provisioned durable state adapter owns the read /
 * compare / conditional write as ONE serializable operation across executors.
 * The executor MUST NOT create or reset a missing record.
 *
 * This module does NOT implement a privileged SQL authority, local file trust
 * anchor, authenticated epoch network source or production entitlements.
 */
import type {
  PrivateCancelVerifiedEpochV1,
} from './official-reader-portone-cancel-private-execution-epoch-v1.js';
import type {
  PrivateCancelPolicyContextV1,
} from './official-reader-portone-cancel-private-policy-bound-permit-v1.js';

export type PrivateCancelDurableEpochRecordV1=Readonly<{
  schema:'myeongha.cancel.ops.durable-epoch.v1';
  sequence:number;
  fingerprint:string;
  status:'active'|'halted';
  policyContext:PrivateCancelPolicyContextV1;
}>;

export type PrivateCancelDurableEpochDecisionV1=Readonly<{
  allowed:boolean;
  nextRecord:PrivateCancelDurableEpochRecordV1;
  reason:'unchanged'|'advanced'|'halted'|'rollback'|'equivocation'|
    'policy_rollback'|'policy_conflict'|'root_changed'|'invalid_record';
}>;

/**
 * A separate protected store must commit the result of compareDurableEpochV1
 * atomically with its previous value. The adapter must reject missing and
 * corrupted records; NO implicit empty-state initialization.
 */
export type PrivateCancelDurableEpochWatermarkPortV1=Readonly<{
  observeVerifiedEpoch(epoch:PrivateCancelVerifiedEpochV1):Promise<void>;
}>;

const FINGERPRINT=/^[a-f0-9]{64}$/u;
const HASH=/^sha256:[a-f0-9]{64}$/u;
const ROOT=/^root_[a-z0-9_]{6,32}$/u;
const POLICY=/^policy_[a-z0-9_]{6,32}$/u;
function exact(value:unknown,fields:readonly string[]):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
}
function context(value:unknown):value is PrivateCancelPolicyContextV1{
  return exact(value,['policyDigest','policyId','revision','rootKeyId'])
    && typeof value.rootKeyId==='string'&&ROOT.test(value.rootKeyId)
    && typeof value.policyId==='string'&&POLICY.test(value.policyId)
    && Number.isSafeInteger(value.revision)&&value.revision>=1
    && typeof value.policyDigest==='string'&&HASH.test(value.policyDigest);
}
function verifiedEpoch(value:unknown):value is PrivateCancelVerifiedEpochV1{
  return exact(value,['fingerprint','policyContext','sequence','status'])
    && Number.isSafeInteger(value.sequence)&&value.sequence>=1
    && typeof value.fingerprint==='string'&&FINGERPRINT.test(value.fingerprint)
    && (value.status==='active'||value.status==='halted')
    && context(value.policyContext);
}
export function isPrivateCancelDurableEpochRecordV1(
  value:unknown,
):value is PrivateCancelDurableEpochRecordV1{
  return exact(value,[
    'fingerprint','policyContext','schema','sequence','status',
  ])
    && value.schema==='myeongha.cancel.ops.durable-epoch.v1'
    && Number.isSafeInteger(value.sequence)&&value.sequence>=1
    && typeof value.fingerprint==='string'&&FINGERPRINT.test(value.fingerprint)
    && (value.status==='active'||value.status==='halted')
    && context(value.policyContext);
}
function toRecord(value:PrivateCancelVerifiedEpochV1):PrivateCancelDurableEpochRecordV1{
  return Object.freeze({
    schema:'myeongha.cancel.ops.durable-epoch.v1',
    sequence:value.sequence,
    fingerprint:value.fingerprint,
    status:value.status,
    policyContext:Object.freeze({...value.policyContext}),
  });
}
/** Used ONLY by an independently approved initializer in test fixtures. */
export function seedPrivateCancelDurableEpochRecordV1(
  verified:PrivateCancelVerifiedEpochV1,
):PrivateCancelDurableEpochRecordV1{
  if(!verifiedEpoch(verified))throw new Error('Private cancel durable watermark seed invalid.');
  return toRecord(verified);
}
/**
 * Pure monotonic transition. It never promotes a terminated policy, rolls
 * back an epoch, silently swaps a same-revision digest or rotates trust roots.
 * Policy-root transitions need a separate, independently approved cutover.
 */
export function comparePrivateCancelDurableEpochV1(
  previous:unknown,next:unknown,
):PrivateCancelDurableEpochDecisionV1{
  if(!isPrivateCancelDurableEpochRecordV1(previous)
    ||!verifiedEpoch(next)){
    throw new Error('Private cancel durable watermark absent, corrupted or untrusted.');
  }
  const old=previous;
  const fresh=next;
  const deny=(reason:PrivateCancelDurableEpochDecisionV1['reason']):
    PrivateCancelDurableEpochDecisionV1=>Object.freeze({
      allowed:false,
      // Durable security incidents cannot be cured by reboot. An observed
      // rollback, equivocation or policy conflict STICKS as HALTED until an
      // independently authorized reset protocol (not implemented).
      nextRecord:reason==='halted'?old:Object.freeze({...old,status:'halted'}),
      reason,
    });
  if(old.status==='halted')return deny('halted');
  if(fresh.sequence<old.sequence)return deny('rollback');
  if(fresh.sequence===old.sequence){
    if(fresh.fingerprint!==old.fingerprint)return deny('equivocation');
    if(fresh.status!=='active')return deny('halted');
    return Object.freeze({allowed:true,nextRecord:old,reason:'unchanged'});
  }
  if(fresh.policyContext.rootKeyId!==old.policyContext.rootKeyId
    ||fresh.policyContext.policyId!==old.policyContext.policyId){
    return deny('root_changed');
  }
  if(fresh.policyContext.revision<old.policyContext.revision){
    return deny('policy_rollback');
  }
  if(fresh.policyContext.revision===old.policyContext.revision
    &&fresh.policyContext.policyDigest!==old.policyContext.policyDigest){
    return deny('policy_conflict');
  }
  const record=toRecord(fresh);
  if(fresh.status==='halted'){
    // A witnessed HALT must be DURABLY recorded before the executor returns
    // a denial. Subsequent ACTIVE updates cannot revive it without a
    // separate release protocol (not implemented).
    return Object.freeze({allowed:false,nextRecord:record,reason:'halted'});
  }
  return Object.freeze({allowed:true,nextRecord:record,reason:'advanced'});
}
