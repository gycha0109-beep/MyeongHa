/**
 * Classifies an isolated restored-Postgres private withdrawal Claim replay.
 * No subject IDs or Claim contents enter this contract. Observing zero rows
 * after deletion cannot prove a deletion unless a pre-finalizer row existed.
 * This classification is never a launch, refund or data-recovery approval.
 */
export function classifyRestoredPrivateClaimDeletionV1({
  relation,preExistingClaimSubjectCount,accountDeletionCount,
}) {
  if(!['present','absent'].includes(relation)||
     !Number.isSafeInteger(preExistingClaimSubjectCount)||
     preExistingClaimSubjectCount<0||
     !Number.isSafeInteger(accountDeletionCount)||
     accountDeletionCount<1||
     preExistingClaimSubjectCount>accountDeletionCount||
     (relation==='absent'&&preExistingClaimSubjectCount!==0)) {
    throw Error('RESTORED_PRIVATE_CLAIM_DELETION_EVIDENCE_INVALID');
  }
  const witnessed=relation==='present'&&preExistingClaimSubjectCount>0;
  return Object.freeze({
    private_withdrawal_claim_replay_guard:relation==='absent'
      ?'schema-absent-no-private-claim-proof'
      :witnessed?'exact-subject-after-finalizer-and-completion-pass'
       :'exact-subject-zero-after-replay-no-pre-finalizer-deletion-witness',
    private_withdrawal_claim_deletion_witnessed:witnessed,
  });
}

/**
 * Aggregate conservation guard for an isolated restored DB.
 * If target Subjects held N private Claim rows before deletion, only N rows
 * may disappear from the ENTIRE private Claim table at the end of the replay.
 * Counts cannot prove unrelated row-by-row identity; never report that.
 * Identifiers, bodies and individual non-target Subjects are never queried
 * or emitted by this helper.
 */
export function verifyRestoredPrivateClaimRowConservationV1({
  relation,totalBefore,totalAfter,targetBeforeCounts,accountDeletionCount,
}) {
  const invalid=()=>{throw Error('RESTORED_PRIVATE_CLAIM_ROW_CONSERVATION_INVALID');};
  const num=v=>{
    if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/u.test(v))invalid();
    return BigInt(v);
  };
  if(!Number.isSafeInteger(accountDeletionCount)||accountDeletionCount<1||
     !Array.isArray(targetBeforeCounts))invalid();
  if(relation==='absent'){
    if(totalBefore!==null||totalAfter!==null||targetBeforeCounts.length!==0)
      invalid();
    return Object.freeze({
      private_withdrawal_claim_unrelated_row_count_guard:
        'schema-absent-not-checked',
    });
  }
  if(relation!=='present'||targetBeforeCounts.length!==accountDeletionCount)
    invalid();
  const before=num(totalBefore);
  const after=num(totalAfter);
  const target=targetBeforeCounts.reduce((sum,n)=>sum+num(n),0n);
  if(target>before||before-target!==after)invalid();
  return Object.freeze({
    private_withdrawal_claim_unrelated_row_count_guard:
      'aggregate-conservation-pass-not-row-identity-proof',
  });
}

/**
 * Compares an order-independent SHA-256 fingerprint of EVERY unrelated
 * private Claim's canonical full-row JSON as observed inside the isolated
 * restored PostgreSQL.  Each row is hashed in SQL, sorted by its digest, then
 * the stream is hashed again; no raw row/identifier/digest is published.
 * This closes the count-only gap: an unchanged count alone cannot detect a
 * rewritten unrelated customer Claim. It remains a cryptographic witness,
 * not independent evidence of backup provenance or a statutory disposition.
 */
export function verifyRestoredPrivateClaimUnrelatedFingerprintV1({
  relation,totalBefore,targetBeforeCounts,accountDeletionCount,
  beforeFingerprint,afterFingerprint,
}) {
  const invalid=()=>{
    throw Error('RESTORED_PRIVATE_CLAIM_UNRELATED_FINGERPRINT_INVALID');
  };
  const numeric=value=>{
    if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/u.test(value))
      invalid();
    return BigInt(value);
  };
  if(!Number.isSafeInteger(accountDeletionCount)||accountDeletionCount<1||
     !Array.isArray(targetBeforeCounts))invalid();
  if(relation==='absent'){
    if(totalBefore!==null||targetBeforeCounts.length!==0||
       beforeFingerprint!==null||afterFingerprint!==null)invalid();
    return Object.freeze({
      private_withdrawal_claim_unrelated_row_fingerprint_guard:
        'schema-absent-not-checked',
    });
  }
  if(relation!=='present'||targetBeforeCounts.length!==accountDeletionCount||
     typeof beforeFingerprint!=='string'||
     typeof afterFingerprint!=='string'||
     !/^[0-9a-f]{64}$/u.test(beforeFingerprint)||
     !/^[0-9a-f]{64}$/u.test(afterFingerprint)||
     beforeFingerprint!==afterFingerprint)invalid();
  const before=numeric(totalBefore);
  const targets=targetBeforeCounts.reduce((sum,count)=>sum+numeric(count),0n);
  if(targets>before)invalid();
  return Object.freeze({
    private_withdrawal_claim_unrelated_row_fingerprint_guard:
      before===targets ? 'no-unrelated-claim-row-to-witness'
        :'sha256-full-row-multiset-consistent',
  });
}
