// Watchtower-Track: security
// W42: a nonce-bound DB HMAC for a PUBLIC synthetic local guard fixture.
// This is NOT an OpenAI signature, independently authenticated model output,
// genuine Character/semantic Output Guard PASS, G2 Commit or HTTP Reveal.
// The secret is generated and retained exclusively in the named scratch DB.
import {executePostgresSubjectTransactionV1}
  from './postgres-subject-execution.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1}
  from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {SeyeonR41OfflineLocalWitnessV1}
  from './seyeon-r41-offline-guard-fixture-db-v1.js';

const SCRATCH='myeongha_seyeon_positive_pin_candidate_test';
const SHA=/^sha256:pg-jsonb:v1:[0-9a-f]{64}$/u;
export interface SeyeonR42OfflineDbIssuedSealReceiptV1{
  readonly status:'isolated_db_issued_local_fixture_seal_no_provider';
  readonly attemptId:string;
  readonly selectedSourcesDigest:string;
  readonly guardedEnvelopeDigest:string;
  readonly sealFingerprint:string;
  readonly providerOutputVerified:false;
  readonly outputGuardVerified:false;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export class SeyeonR42OfflineDbSealHoldV1 extends Error{
  readonly code='R42_LOCAL_DB_HMAC_NOT_REAL_MODEL_AUTHORITY' as const;
  constructor(){
    super('Isolated DB issuer has not confirmed its non-provider fixture seal.');
    this.name='SeyeonR42OfflineDbSealHoldV1';
  }
}
/** A DB Owner recomputes every authoritative input before issuing its
 * nonce-bound, expiring HMAC. Neither the secret nor the signature is
 * returned, and only the same transaction's verification permits this
 * *diagnostic* receipt to escape the transaction. ALL rights remain false.
 */
export async function issueSeyeonR42OfflineDbLocalSealV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly localWitness:SeyeonR41OfflineLocalWitnessV1;
}):Promise<SeyeonR42OfflineDbIssuedSealReceiptV1>{
  try{
    const {pinInput,localWitness}=input;
    if(pinInput.verifiedEvidence.kind!=='member'
      ||localWitness.attemptId!==pinInput.attemptId
      ||localWitness.selectedSourcesDigest!==
        pinInput.selection.selectedSourcesDigest
      ||localWitness.status!==
        'isolated_code_authored_guard_fixture_fingerprints_matched'
      ||localWitness.providerDispatched!==false
      ||localWitness.providerOutputVerified!==false
      ||localWitness.outputGuardVerified!==false
      ||localWitness.permitsAtomicCommit!==false
      ||localWitness.permitsHttpReveal!==false)
      throw new SeyeonR42OfflineDbSealHoldV1();
    return await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR42OfflineDbSealHoldV1();
        const db=await client.query<{name:string}>(
          'select current_database() as name',
        );
        if(db.rows.length!==1||db.rows[0]?.name!==SCRATCH)
          throw new SeyeonR42OfflineDbSealHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '9000ms'");
        const signed=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.issue_local_guard_seal_r42(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,
          pinInput.turnId,pinInput.attemptId,
        ]);
        const value=signed.rows.length===1?signed.rows[0]?.receipt:null;
        if(!value||typeof value!=='object'||Array.isArray(value))
          throw new SeyeonR42OfflineDbSealHoldV1();
        const receipt=value as Record<string,unknown>;
        if(receipt.status!=='isolated_db_issued_local_fixture_seal_no_provider'
          ||receipt.attemptId!==pinInput.attemptId
          ||receipt.selectedSourcesDigest!==localWitness.selectedSourcesDigest
          ||receipt.guardedEnvelopeDigest!==localWitness.guardedEnvelopeDigest
          ||typeof receipt.sealFingerprint!=='string'
          ||!SHA.test(receipt.sealFingerprint)
          ||receipt.providerOutputVerified!==false
          ||receipt.outputGuardVerified!==false
          ||receipt.permitsProvider!==false
          ||receipt.permitsAtomicCommit!==false
          ||receipt.permitsHttpReveal!==false)
          throw new SeyeonR42OfflineDbSealHoldV1();
        const verified=await client.query<{valid:boolean}>(`
select seyeon_positive_candidate.verify_local_guard_seal_r42(
  $1::uuid
) as valid
`.trim(),[pinInput.attemptId]);
        if(verified.rows.length!==1||verified.rows[0]?.valid!==true)
          throw new SeyeonR42OfflineDbSealHoldV1();
        return Object.freeze(
          receipt as unknown as SeyeonR42OfflineDbIssuedSealReceiptV1,
        );
      },
    });
  }catch{
    throw new SeyeonR42OfflineDbSealHoldV1();
  }
}
