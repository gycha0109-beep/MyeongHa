/**
 * D3e19: REAL D3e8 sandbox review SQL + pinned signed epoch, CI clone ONLY.
 * Never a PortOne refund, entitlement revoke or production permission.
 */
import {createHash,generateKeyPairSync,randomUUID,sign as edSign} from 'node:crypto';
import pg from 'pg';
import {describe,expect,it} from 'vitest';
import {
  canonicalPrivateCancelExecutionEpochV1,
  type PrivateCancelExecutionEpochBodyV1,
} from '../apps/api/src/official-reader-portone-cancel-private-execution-epoch-v1.js';
import {
  createOfflinePrivateCancelAtomicReviewStoreTestV1,
} from './support/private-official-reader-cancel-atomic-epoch-review-store-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';

const ALLOWED=process.env.CI==='true'
  &&process.env.PGHOST==='localhost'
  &&process.env.PGDATABASE==='myeongha_cancel_d3e19_review_real_ci'
  &&process.env.MYEONGHA_D3E19_PG_REVIEW==='1';

describe.runIf(ALLOWED)('D3e19 signed epoch + REAL sandbox 1950 review PostgreSQL',()=>{
  it('commits only with same-transaction current signed policy and refuses old/HALT',async()=>{
    const pool=new pg.Pool({max:5});
    const signer=generateKeyPairSync('ed25519');
    const pin={
      keyId:'epoch_offline_001',
      publicKeyPem:signer.publicKey.export({format:'pem',type:'spki'}) as string,
    };
    const policy={
      rootKeyId:'root_offline_001',policyId:'policy_private_001',
      revision:7,policyDigest:'sha256:'+'a'.repeat(64),
    };
    let sequence=9;
    let status:'active'|'halted'='active';
    const clock=()=>new Date();
    const build=():PrivateCancelExecutionEpochBodyV1=>{
      const n=Date.now();
      return {
        protocol:'myeongha.cancel.ops.execution-epoch.v1',
        audience:'myeongha.cancel.ops.private-executor.v1',
        environment:'sandbox',signerKeyId:pin.keyId,
        sequence,status,rootKeyId:policy.rootKeyId,
        policyId:policy.policyId,policyRevision:policy.revision,
        policyDigest:policy.policyDigest,
        issuedAt:new Date(n).toISOString(),expiresAt:new Date(n+4000).toISOString(),
      };
    };
    let snapshot=build();
    const readSigned=async()=>({
      body:snapshot,signatureBase64:edSign(
        null,canonicalPrivateCancelExecutionEpochV1(snapshot),
        signer.privateKey,
      ).toString('base64'),
    });
    const fingerprint=()=>createHash('sha256')
      .update(canonicalPrivateCancelExecutionEpochV1(snapshot)).digest('hex');
    const store=createOfflinePrivateCancelAtomicReviewStoreTestV1({
      pool:pool as unknown as PostgresSubjectPoolV1,
      pinnedEpochSigner:pin,readCurrentSignedEpoch:readSigned,
      trustedClock:clock,expectedPolicy:policy,
    });

    const inbox=async(label:string)=>{
      const unique=label+'-'+randomUUID();
      const admitted=await pool.query<{intake_result:string}>(
        ['SELECT intake_result FROM',
          'public.internal_enqueue_official_reader_portone_cancel_inbox_v1(',
          "'sandbox',$1,$2,$3,'d3e19-ci',$4,",
          "'Transaction.Cancelled',$5::timestamptz,$6)",
        ].join(' '),[
          'd3e19-wh-'+unique,'d3e19-pay-'+unique,
          'd3e19-tx-'+unique,'d3e19-cancel-'+unique,
          clock().toISOString(),'hmac-sha256:k1:'+'c'.repeat(64),
        ],
      );
      expect(admitted.rows[0]?.intake_result).toBe('queued');
      const worker='d3e19_'+label;
      const claim=await pool.query<{inbox_id:string;claim_token:string}>(
        'SELECT inbox_id,claim_token FROM public.internal_claim_official_reader_cancel_work_v1($1,$2)',
        [worker,90],
      );
      expect(claim.rows).toHaveLength(1);
      const id=claim.rows[0]!.inbox_id;
      const fail=await pool.query<{failure_state:string}>(
        'SELECT failure_state FROM public.internal_fail_official_reader_cancel_work_v1($1::uuid,$2,$3::uuid,$4,$5)',
        [id,worker,claim.rows[0]!.claim_token,'SOURCE_MISMATCH',false],
      );
      expect(fail.rows[0]?.failure_state).toBe('held');
      return id;
    };
    const command=(id:string)=>({
      inboxId:id,action:'acknowledge' as const,ticketReference:'OPS-2026101501',
      challengeId:randomUUID(),
      issuedAt:new Date(Date.now()-60000).toISOString(),
      expiresAt:new Date(Date.now()+240000).toISOString(),
      requesterKeyId:'key_request_001',approverKeyId:'key_approve_002',
      requesterPrincipalId:'op_request_001',
      approverPrincipalId:'op_approve_002',
      statementDigest:'sha256:'+'b'.repeat(64),
    });
    const approvalCount=async(id:string)=>{
      const x=await pool.query<{n:string}>(
        'SELECT count(*)::text AS n FROM public.official_reader_cancel_review_approval_v1 WHERE inbox_id=$1::uuid',
        [id],
      );
      return x.rows[0]?.n;
    };

    try{
      await pool.query('CREATE SCHEMA myeongha_cancel_d3e19_review_ci');
      await pool.query([
        'CREATE TABLE myeongha_cancel_d3e19_review_ci.execution_epoch (',
        'id integer PRIMARY KEY CHECK(id=1),',
        'sequence bigint NOT NULL,status text NOT NULL,',
        'fingerprint text NOT NULL,policy_digest text NOT NULL,',
        'root_key_id text NOT NULL,policy_id text NOT NULL,',
        'policy_revision bigint NOT NULL)',
      ].join(' '));
      await pool.query([
        'INSERT INTO myeongha_cancel_d3e19_review_ci.execution_epoch',
        '(id,sequence,status,fingerprint,policy_digest,root_key_id,policy_id,policy_revision)',
        'VALUES(1,$1,$2,$3,$4,$5,$6,$7)',
      ].join(' '),[
        sequence,status,fingerprint(),policy.policyDigest,
        policy.rootKeyId,policy.policyId,policy.revision,
      ]);

      const first=await inbox('first');
      const positive=await store.commitAuthorizedReview(command(first));
      expect(positive).toMatchObject({reviewState:'held',effectAuthorized:false});
      expect(await approvalCount(first)).toBe('1');

      const second=await inbox('second');
      // DB policy changes AFTER an earlier trusted signed preflight.
      await pool.query('UPDATE myeongha_cancel_d3e19_review_ci.execution_epoch SET sequence=10 WHERE id=1');
      await expect(store.commitAuthorizedReview(command(second)))
        .rejects.toThrow('DENY');
      expect(await approvalCount(second)).toBe('0');

      sequence=10;snapshot=build();
      await pool.query(
        'UPDATE myeongha_cancel_d3e19_review_ci.execution_epoch SET fingerprint=$1 WHERE id=1',
        [fingerprint()],
      );
      const refreshed=await store.commitAuthorizedReview(command(second));
      expect(refreshed).toMatchObject({reviewState:'held',effectAuthorized:false});
      expect(await approvalCount(second)).toBe('1');

      const third=await inbox('third');
      status='halted';snapshot=build();
      await pool.query(
        "UPDATE myeongha_cancel_d3e19_review_ci.execution_epoch SET status='halted',fingerprint=$1 WHERE id=1",
        [fingerprint()],
      );
      await expect(store.commitAuthorizedReview(command(third))).rejects.toThrow();
      expect(await approvalCount(third)).toBe('0');
      const money=await pool.query<{n:string}>(
        'SELECT count(*)::text AS n FROM public.entitlement_events',
      );
      expect(money.rows[0]?.n).toBe('0');
    }finally{
      await pool.end();
    }
  },40000);
});
