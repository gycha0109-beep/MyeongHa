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
