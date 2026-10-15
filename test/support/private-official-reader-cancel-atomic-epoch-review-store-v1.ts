/**
 * D3e19 TEST-SUPPORT ONLY: connect a fresh independently signed cancellation
 * epoch to the REAL D3e8 sandbox review SQL under ONE PostgreSQL transaction.
 *
 * The ONLY effect is a D3e8 review/acknowledgement/retry receipt in an isolated
 * disposable database; it is NOT a provider refund or entitlement grant write.
 *
 * The synthetic epoch row MUST be updated by every policy writer using the
 * SAME PostgreSQL row lock. The detached trusted signer is verified AFTER
 * acquiring this row lock and the exact signed policy must equal that row.
 * A TS preflight alone cannot make the DB check atomic.
 *
 * NOT production authority: no process isolation/real DB owner enforcement,
 * no independent durable source guarantee, no mounted HTTP/worker, and no
 * cutover of legacy direct owner paths. Do not import from apps/api.
 */
import {
  verifyPrivateCancelSignedExecutionEpochV1,
  type PrivateCancelTrustedEpochSignerV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-execution-epoch-v1.js';
import type {
  PrivateCancelPolicyContextV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-policy-bound-permit-v1.js';
import type {
  PrivateCancelReviewAuthorizedStoreV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import type {PostgresSubjectPoolV1} from
  '../../apps/api/src/postgres-subject-execution.js';

export const OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1 = [
  'SELECT sequence::text AS "sequence", status AS "status",',
  'fingerprint AS "fingerprint", policy_digest AS "policyDigest",',
  'root_key_id AS "rootKeyId",policy_id AS "policyId",',
  'policy_revision::text AS "policyRevision"',
  'FROM myeongha_cancel_d3e19_review_ci.execution_epoch',
  'WHERE id=1 FOR UPDATE',
].join(' ');

export const OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1 = [
  'SELECT review_state AS "reviewState",',
  'authorization_receipt_id::text AS "authorizationReceiptId",',
  'effect_authorized AS "effectAuthorized"',
  'FROM public.internal_private_cancel_commit_review_approval_v1(',
  '$1::uuid,$2::text,$3::text,$4::uuid,$5::timestamptz,$6::timestamptz,',
  '$7::text,$8::text,$9::text,$10::text,$11::text)',
].join(' ');

const UINT=/^[1-9][0-9]*$/u;
function transactionError():Error{
  return new Error('Offline cancel atomic review epoch mismatch, unavailable or HALTED: DENY.');
}

/** A *test-only* adapter implementing the existing D3e8 reviewer-store port.
 * The epoch signer/policy/source are fixed at construction, not from requests.
 */
export function createOfflinePrivateCancelAtomicReviewStoreTestV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  pinnedEpochSigner:PrivateCancelTrustedEpochSignerV1;
  trustedClock:()=>Date;
  readCurrentSignedEpoch:()=>Promise<unknown>;
  expectedPolicy:PrivateCancelPolicyContextV1;
}>):PrivateCancelReviewAuthorizedStoreV1{
  if(!input||typeof input.pool?.connect!=='function'
    ||typeof input.trustedClock!=='function'
    ||typeof input.readCurrentSignedEpoch!=='function'
    ||!input.expectedPolicy
    ||typeof input.pinnedEpochSigner?.publicKeyPem!=='string'){
    throw new Error('Offline cancel atomic review requires independently pinned test dependencies.');
  }
  const {pool,trustedClock,readCurrentSignedEpoch,pinnedEpochSigner,expectedPolicy}=input;
  return Object.freeze({
    async commitAuthorizedReview(command){
      const client=await pool.connect();
      let begun=false;
      try{
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        begun=true;
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        const held=await client.query<Record<string,unknown>>(
          OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1,
        );
        if(held.rows.length!==1||!held.rows[0]){
          throw transactionError();
        }
        // Verify signature and <=2s freshness AFTER acquiring the policy row.
        // A process cache or caller-supplied epoch cannot become authority.
        const envelope=await readCurrentSignedEpoch();
        const now=trustedClock();
        const verified=verifyPrivateCancelSignedExecutionEpochV1({
          envelope,pinnedSigner:pinnedEpochSigner,now,
        });
        const row=held.rows[0];
        const revision=row.policyRevision;
        const sequence=row.sequence;
        if(row.status!=='active'||verified.status!=='active'
          ||typeof sequence!=='string'||!UINT.test(sequence)
          ||typeof revision!=='string'||!UINT.test(revision)
          ||BigInt(sequence)!==BigInt(verified.sequence)
          ||BigInt(revision)!==BigInt(verified.policyContext.revision)
          ||row.fingerprint!==verified.fingerprint
          ||row.policyDigest!==verified.policyContext.policyDigest
          ||row.rootKeyId!==verified.policyContext.rootKeyId
          ||row.policyId!==verified.policyContext.policyId
          ||verified.policyContext.policyDigest!==expectedPolicy.policyDigest
          ||verified.policyContext.rootKeyId!==expectedPolicy.rootKeyId
          ||verified.policyContext.policyId!==expectedPolicy.policyId
          ||verified.policyContext.revision!==expectedPolicy.revision){
          throw transactionError();
        }
        const result=await client.query<Record<string,unknown>>(
          OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1,[
            command.inboxId,command.action,command.ticketReference,
            command.challengeId,command.issuedAt,command.expiresAt,
            command.requesterKeyId,command.approverKeyId,
            command.requesterPrincipalId,command.approverPrincipalId,
            command.statementDigest,
          ],
        );
        if(result.rows.length!==1||!result.rows[0]
          ||result.rows[0].effectAuthorized!==false){
          throw new Error('Offline cancel atomic SQL returned an invalid no-effect receipt.');
        }
        await client.query('COMMIT');
        return result.rows[0];
      }catch(error){
        if(begun){
          try{await client.query('ROLLBACK');}
          catch{throw new Error('Offline cancel atomic SQL rollback failed: DENY.');}
        }
        throw error;
      }finally{
        client.release();
      }
    },
  });
}
