import {generateKeyPairSync,sign as edSign} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {
  canonicalPrivateCancelExecutionEpochV1,
  type PrivateCancelExecutionEpochBodyV1,
} from '../apps/api/src/official-reader-portone-cancel-private-execution-epoch-v1.js';
import {
  createOfflinePrivateCancelAtomicReviewStoreTestV1,
  OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1,
  OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1,
} from './support/private-official-reader-cancel-atomic-epoch-review-store-v1.js';
import type {PostgresSubjectPoolV1} from
  '../apps/api/src/postgres-subject-execution.js';

const NOW='2026-10-15T02:00:00.000Z';
const DIGEST='sha256:'+'a'.repeat(64);
const RECEIPT='00000000-0000-4000-8000-000000000090';
const policy={
  rootKeyId:'root_offline_001',policyId:'policy_private_001',
  revision:7,policyDigest:DIGEST,
};
const command={
  inboxId:'00000000-0000-4000-8000-000000000091',
  action:'acknowledge' as const,ticketReference:'OPS-2026101520',
  challengeId:'00000000-0000-4000-8000-000000000092',
  issuedAt:'2026-10-15T01:58:00.000Z',expiresAt:'2026-10-15T02:04:00.000Z',
  requesterKeyId:'key_request_001',approverKeyId:'key_approve_002',
  requesterPrincipalId:'op_request_001',approverPrincipalId:'op_approve_002',
  statementDigest:'sha256:'+'b'.repeat(64),
};
function fixture(){
  const signer=generateKeyPairSync('ed25519');
  const other=generateKeyPairSync('ed25519');
  const pin={keyId:'epoch_offline_001',
    publicKeyPem:signer.publicKey.export({format:'pem',type:'spki'}) as string};
  let body:PrivateCancelExecutionEpochBodyV1={
    protocol:'myeongha.cancel.ops.execution-epoch.v1',
    environment:'sandbox',audience:'myeongha.cancel.ops.private-executor.v1',
    signerKeyId:pin.keyId,sequence:9,status:'active',
    rootKeyId:policy.rootKeyId,policyId:policy.policyId,
    policyRevision:policy.revision,policyDigest:policy.policyDigest,
    issuedAt:NOW,expiresAt:'2026-10-15T02:00:04.000Z',
  };
  let signerKey=signer.privateKey;
  function envelope(){
    return {body,signatureBase64:edSign(null,
      canonicalPrivateCancelExecutionEpochV1(body),signerKey).toString('base64')};
  }
  const currentRow:Record<string,unknown>={
    sequence:'9',status:'active',fingerprint:'',policyDigest:DIGEST,
    rootKeyId:policy.rootKeyId,policyId:policy.policyId,policyRevision:'7',
  };
  const readSigned=vi.fn(async()=>envelope());
  const calls:string[]=[];
  const rows=vi.fn(async(sql:string,values?:readonly unknown[])=>{
    calls.push(sql);
    if(sql===OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1){
      const {createHash:hash}=await import('node:crypto');
      const fingerprint=hash('sha256')
        .update(canonicalPrivateCancelExecutionEpochV1(body)).digest('hex');
      if(!currentRow.fingerprint) currentRow.fingerprint=fingerprint;
      return {rows:[{...currentRow}]};
    }
    if(sql===OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1){
      expect(values).toHaveLength(11);
      expect(values?.[0]).toBe(command.inboxId);
      return {rows:[{reviewState:'held',effectAuthorized:false,
        authorizationReceiptId:RECEIPT}]};
    }
    return {rows:[]};
  });
  const release=vi.fn();
  const pool={connect:vi.fn(async()=>({query:rows,release}))} as unknown as PostgresSubjectPoolV1;
  const run=()=>createOfflinePrivateCancelAtomicReviewStoreTestV1({
    pool,pinnedEpochSigner:pin,readCurrentSignedEpoch:readSigned,
    trustedClock:()=>new Date(NOW),expectedPolicy:policy,
  }).commitAuthorizedReview(command);
  return {
    body,pin,other,readSigned,currentRow,calls,rows,release,pool,
    run,setBody:(changes:Partial<PrivateCancelExecutionEpochBodyV1>)=>{
      body={...body,...changes};
    },
    useRogue:()=>{signerKey=other.privateKey;},
  };
}

describe('D3e19 offline signed epoch + original D3e8 transactional SQL bridge',()=>{
  it('locks policy row, verifies independent signature, writes D3e8 and commits on ONE connection',async()=>{
    const f=fixture();
    expect(await f.run()).toEqual({
      reviewState:'held',effectAuthorized:false,authorizationReceiptId:RECEIPT,
    });
    expect(f.calls).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      "SET LOCAL lock_timeout = '2000ms'",
      "SET LOCAL statement_timeout = '5000ms'",
      OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1,
      OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1,
      'COMMIT',
    ]);
    expect(f.readSigned).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1).toContain(
      'internal_private_cancel_commit_review_approval_v1',
    );
    expect(OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1)
      .not.toContain('internal_apply_reviewed_official_reader_full_cancel_private_v1');
  });

  it.each([
    {case:'revoked',changeRow:{status:'halted'}},
    {case:'updated by another writer',changeRow:{sequence:'10'}},
    {case:'row equivocation',changeRow:{fingerprint:'f'.repeat(64)}},
    {case:'changed policy',changeRow:{policyDigest:'sha256:'+'c'.repeat(64)}},
    {case:'wrong root',changeRow:{rootKeyId:'root_different_001'}},
    {case:'wrong policy id',changeRow:{policyId:'policy_other_001'}},
    {case:'changed revision',changeRow:{policyRevision:'8'}},
    {case:'invalid PostgreSQL type',changeRow:{sequence:9}},
    {case:'missing state',changeRow:{sequence:null}},
  ])('denies before invoking D3e8 when $case',async({changeRow})=>{
    const f=fixture();Object.assign(f.currentRow,changeRow);
    await expect(f.run()).rejects.toThrow('DENY');
    expect(f.calls).not.toContain(OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1);
    expect(f.calls.at(-1)).toBe('ROLLBACK');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('rejects forged Ed25519 signature, changed signed policy, HALT, expired evidence',async()=>{
    const variants=[
      (f:ReturnType<typeof fixture>)=>f.useRogue(),
      (f:ReturnType<typeof fixture>)=>f.setBody({status:'halted'}),
      (f:ReturnType<typeof fixture>)=>f.setBody({sequence:8}),
      (f:ReturnType<typeof fixture>)=>f.setBody({policyRevision:8}),
      (f:ReturnType<typeof fixture>)=>f.setBody({issuedAt:'2026-10-15T01:59:40.000Z'}),
    ];
    for(const change of variants){
      const f=fixture();change(f);
      await expect(f.run()).rejects.toThrow();
      expect(f.calls).not.toContain(OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1);
      expect(f.calls.at(-1)).toBe('ROLLBACK');
    }
  });

  it('rolls back after SQL rejection or an invalid approval receipt',async()=>{
    const f=fixture();
    f.rows.mockImplementation(async(sql:string)=>{
      f.calls.push(sql);
      if(sql===OFFLINE_CANCEL_ATOMIC_EPOCH_ROW_SQL_V1){
        const {createHash}=await import('node:crypto');
        const fp=createHash('sha256')
          .update(canonicalPrivateCancelExecutionEpochV1(f.body)).digest('hex');
        return {rows:[{...f.currentRow,fingerprint:fp}]};
      }
      if(sql===OFFLINE_CANCEL_ATOMIC_REVIEW_SQL_V1){
        return {rows:[{effectAuthorized:true}]};
      }
      return {rows:[]};
    });
    await expect(f.run()).rejects.toThrow('invalid no-effect receipt');
    expect(f.calls).not.toContain('COMMIT');
    expect(f.calls.at(-1)).toBe('ROLLBACK');
  });

  it('fails closed on database query outage, absent role or missing connection',async()=>{
    const f=fixture();
    f.rows.mockRejectedValueOnce(new Error('simulated connection query failure'));
    await expect(f.run()).rejects.toThrow('simulated connection');
    expect(f.release).toHaveBeenCalledOnce();
    const broken=fixture();
    await expect(createOfflinePrivateCancelAtomicReviewStoreTestV1({
      pool:{connect:async()=>{throw new Error('db unreachable');}},
      pinnedEpochSigner:broken.pin,
      readCurrentSignedEpoch:broken.readSigned,
      trustedClock:()=>new Date(NOW),expectedPolicy:policy,
    }).commitAuthorizedReview(command)).rejects.toThrow('db unreachable');
  });
});
