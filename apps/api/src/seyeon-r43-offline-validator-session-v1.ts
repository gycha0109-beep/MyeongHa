// Watchtower-Track: security
// W43: split ordinary Member source validation from the DB-keyed local
// synthetic-guard HMAC issuer. The issuer uses a separate, server-owned
// restricted evaluator connection, never the ordinary API Executor role.
// The isolated CI PostgreSQL login is privileged, and does NOT prove a
// production credential boundary. Real Provider/G2/HTTP remain DENIED.
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1}
  from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {SeyeonR41OfflineLocalWitnessV1}
  from './seyeon-r41-offline-guard-fixture-db-v1.js';
import type {SeyeonR42OfflineDbIssuedSealReceiptV1}
  from './seyeon-r42-offline-db-issued-local-seal-v1.js';

const DB='myeongha_seyeon_positive_pin_candidate_test';
const EVALUATOR='myeongha_seyeon_guard_evaluator_r43';
const FINGERPRINT=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;

export class SeyeonR43EvaluatorAuthorityHoldV1 extends Error{
  readonly code='R43_VALIDATOR_ROLE_NOT_REAL_PROVIDER_AUTHORITY' as const;
  constructor(){
    super('No separately authorized validator may issue a real output approval.');
    this.name='SeyeonR43EvaluatorAuthorityHoldV1';
  }
}
export async function issueSeyeonR43SeparatedLocalGuardSealV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly localWitness:SeyeonR41OfflineLocalWitnessV1;
  /** Mandatory distinct server-owned pool; never the ordinary API pool. */
  readonly validatorPool:PostgresSubjectPoolV1;
}):Promise<SeyeonR42OfflineDbIssuedSealReceiptV1>{
  const {pinInput,localWitness,validatorPool}=input;
  if(validatorPool===pinInput.pool
    ||pinInput.verifiedEvidence.kind!=='member'
    ||localWitness.status!=='isolated_code_authored_guard_fixture_fingerprints_matched'
    ||localWitness.attemptId!==pinInput.attemptId
    ||localWitness.selectedSourcesDigest!==
      pinInput.selection.selectedSourcesDigest
    ||localWitness.providerDispatched!==false
    ||localWitness.providerOutputVerified!==false
    ||localWitness.outputGuardVerified!==false
    ||localWitness.permitsAtomicCommit!==false
    ||localWitness.permitsHttpReveal!==false)
    throw new SeyeonR43EvaluatorAuthorityHoldV1();

  let connection:Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>|null=null;
  let begun=false;
  let discard:unknown;
  try{
    // First trusted Member identification is performed only under the
    // ordinary API role. No MAC issuance is allowed in this transaction.
    const subject=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({resolvedSubject,client})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR43EvaluatorAuthorityHoldV1();
        const info=await client.query<{name:string;role:string}>(
          'select current_database() as name,current_user as role',
        );
        if(info.rows.length!==1||info.rows[0]?.name!==DB
          ||info.rows[0]?.role!=='myeongha_api_executor')
          throw new SeyeonR43EvaluatorAuthorityHoldV1();
        return resolvedSubject.subjectId;
      },
    });
    connection=await validatorPool.connect();
    await connection.query('BEGIN');
    begun=true;
    // SET LOCAL ROLE is temporary and safe for isolated CI; production
    // must provide a non-superuser validator-only credential. A separate
    // Pool object is not itself evidence of separate credentials.
    await connection.query('SET LOCAL ROLE '+EVALUATOR);
    const identity=await connection.query<{
      name:string;role:string;login:string;is_superuser:boolean;
    }>(`select current_database() as name,current_user as role,
      session_user as login,
      coalesce((select rolsuper from pg_catalog.pg_roles
        where rolname=session_user),true) as is_superuser`);
    const id=identity.rows[0];
    if(identity.rows.length!==1||id?.name!==DB||id.role!==EVALUATOR
      ||(id.is_superuser &&
        !(process.env.CI==='true'
          &&process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1'
          &&process.env.PGHOST==='localhost'
          &&process.env.PGDATABASE===DB)))
      throw new SeyeonR43EvaluatorAuthorityHoldV1();
    await connection.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
    await connection.query("SET LOCAL lock_timeout = '2000ms'");
    await connection.query("SET LOCAL statement_timeout = '9000ms'");
    const result=await connection.query<{receipt:unknown}>(`
select seyeon_positive_candidate.issue_local_guard_seal_r42(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
) as receipt
`.trim(),[subject,pinInput.threadId,pinInput.turnId,pinInput.attemptId]);
    const data=result.rows.length===1?result.rows[0]?.receipt:null;
    if(data===null||typeof data!=='object'||Array.isArray(data))
      throw new SeyeonR43EvaluatorAuthorityHoldV1();
    const proof=data as Record<string,unknown>;
    if(proof.status!=='isolated_db_issued_local_fixture_seal_no_provider'
      ||proof.attemptId!==pinInput.attemptId
      ||proof.selectedSourcesDigest!==localWitness.selectedSourcesDigest
      ||proof.guardedEnvelopeDigest!==localWitness.guardedEnvelopeDigest
      ||typeof proof.sealFingerprint!=='string'
      ||!FINGERPRINT.test(proof.sealFingerprint)
      ||proof.providerOutputVerified!==false
      ||proof.outputGuardVerified!==false
      ||proof.permitsProvider!==false
      ||proof.permitsAtomicCommit!==false
      ||proof.permitsHttpReveal!==false)
      throw new SeyeonR43EvaluatorAuthorityHoldV1();
    const check=await connection.query<{valid:boolean}>(`
select seyeon_positive_candidate.verify_local_guard_seal_r42(
  $1::uuid,$2::uuid
) as valid
`.trim(),[subject,pinInput.attemptId]);
    if(check.rows.length!==1||check.rows[0]?.valid!==true)
      throw new SeyeonR43EvaluatorAuthorityHoldV1();
    await connection.query('COMMIT');
    begun=false;
    return Object.freeze(proof as unknown as SeyeonR42OfflineDbIssuedSealReceiptV1);
  }catch{
    if(begun&&connection){
      try{await connection.query('ROLLBACK');}
      catch(e){discard=e;}
    }
    throw new SeyeonR43EvaluatorAuthorityHoldV1();
  }finally{
    connection?.release(discard);
  }
}
