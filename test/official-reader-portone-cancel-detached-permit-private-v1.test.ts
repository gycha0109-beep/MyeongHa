import {
  generateKeyPairSync,randomUUID,sign as edSign,
} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {
  canonicalPrivateCancelReviewStatementV1,
  type PrivateCancelReviewAuthorizedStoreV1,
  type PrivateCancelReviewStatementV1,
} from '../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import {
  canonicalPrivateCancelDetachedPermitV1,
  executeSandboxPrivateCancelReviewPermitV1,
  type PrivateCancelDetachedPermitV1,
} from '../apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.js';
import {
  issueSandboxPrivateCancelReviewPermitV1,
} from './support/private-official-reader-cancel-legacy-permit-issuer-v1.js';

const NOW=new Date('2026-10-14T05:00:00.000Z');
const RECEIPT='00000000-0000-4000-8000-000000000077';
const ISSUER_ID='issuer_offline_test';

function rig(action:'acknowledge'|'retry_transient'='acknowledge'){
  const humanRequester=generateKeyPairSync('ed25519');
  const humanApprover=generateKeyPairSync('ed25519');
  const issuer=generateKeyPairSync('ed25519');
  const outsider=generateKeyPairSync('ed25519');
  const statement:PrivateCancelReviewStatementV1={
    protocol:'myeongha.cancel.ops.review.ed25519.v1',
    environment:'sandbox',inboxId:randomUUID(),action,
    ticketReference:'OPS-2026101410',challengeId:randomUUID(),
    issuedAt:'2026-10-14T04:58:00.000Z',
    expiresAt:'2026-10-14T05:03:00.000Z',
  };
  const signingBytes=canonicalPrivateCancelReviewStatementV1(statement);
  const attestations=[
    {keyId:'key_request_001',
      signatureBase64:edSign(null,signingBytes,humanRequester.privateKey).toString('base64')},
    {keyId:'key_approver_002',
      signatureBase64:edSign(null,signingBytes,humanApprover.privateKey).toString('base64')},
  ];
  const trustedOperatorKeys={
    key_request_001:{
      role:'requester' as const,principalId:'op_request_001',
      publicKeyPem:humanRequester.publicKey.export({format:'pem',type:'spki'}) as string,
      enabled:true as const,
    },
    key_approver_002:{
      role:'approver' as const,principalId:'op_approve_002',
      publicKeyPem:humanApprover.publicKey.export({format:'pem',type:'spki'}) as string,
      enabled:true as const,
    },
  };
  const trustedIssuers={
    [ISSUER_ID]:{
      publicKeyPem:issuer.publicKey.export({format:'pem',type:'spki'}) as string,
      enabled:true as const,
    },
  };
  const store:PrivateCancelReviewAuthorizedStoreV1={
    commitAuthorizedReview:vi.fn(async()=>({
      reviewState:action==='retry_transient'?'queued':'held',
      authorizationReceiptId:RECEIPT,
      effectAuthorized:false,
    })),
  };
  const issue=(changes:Record<string,unknown>={})=>
    issueSandboxPrivateCancelReviewPermitV1({
      statement,attestations,trustedOperatorKeys,
      issuerKeyId:ISSUER_ID,
      issuerPrivateKeyPem:issuer.privateKey.export({format:'pem',type:'pkcs8'}) as string,
      now:NOW,
      ...changes,
    });
  const execute=(permit:unknown,changes:Record<string,unknown>={})=>
    executeSandboxPrivateCancelReviewPermitV1({
      permit,trustedIssuers,now:NOW,store,...changes,
    });
  return {
    statement,attestations,issuer,outsider,store,issue,execute,
    trustedOperatorKeys,trustedIssuers,
  };
}
describe('D3e10 detached offline verifier-signed cancellation review permits',()=>{
  it.each(['acknowledge','retry_transient'] as const)(
    'verifies human Ed25519 proofs and permit issuer separately before %s review',async action=>{
      const f=rig(action);
      const permit=f.issue();
      expect(permit.payload).toMatchObject({
        protocol:'myeongha.cancel.ops.detached-permit.v1',
        environment:'sandbox',issuerKeyId:ISSUER_ID,
        command:{
          action,inboxId:f.statement.inboxId,
          challengeId:f.statement.challengeId,
          ticketReference:f.statement.ticketReference,
        },
      });
      expect(permit.payload.permitExpiresAt).toBe('2026-10-14T05:01:00.000Z');
      expect(permit.signatureBase64).toMatch(/^[A-Za-z0-9+/]{86}==$/u);
      const out=await f.execute(permit);
      expect(out).toEqual({
        reviewState:action==='retry_transient'?'queued':'held',
        approvalRecorded:true,effectAuthorized:false,
        providerRefundAuthorized:false,entitlementMutationAuthorized:false,
      });
      expect(f.store.commitAuthorizedReview).toHaveBeenCalledExactlyOnceWith(
        permit.payload.command,
      );
      const serialized=JSON.stringify(permit);
      expect(serialized).not.toContain(f.attestations[0]!.signatureBase64);
      expect(serialized).not.toContain(f.attestations[1]!.signatureBase64);
      expect(serialized).not.toContain('PRIVATE KEY');
      expect(serialized).not.toContain('paymentId');
    },
  );

  it('all claim fields are cryptographically bound; tampering cannot reach SQL',async()=>{
    const replacements=[
      {inboxId:randomUUID()},
      {action:'retry_transient'},
      {challengeId:randomUUID()},
      {ticketReference:'OPS-99999999'},
      {statementDigest:'sha256:'+'c'.repeat(64)},
      {approverPrincipalId:'op_rogue_123'},
      {requesterKeyId:'key_rogue_123'},
    ];
    for(const changed of replacements){
      const f=rig();
      const p=f.issue();
      await expect(f.execute({
        ...p,payload:{...p.payload,command:{...p.payload.command,...changed}},
      })).rejects.toThrow();
      expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
    }
  });
  it('cannot swap signer keys, roles or issuer public key from permit payload',async()=>{
    const f=rig();
    const p=f.issue();
    await expect(f.execute({
      ...p,payload:{...p.payload,issuerKeyId:'issuer_attacker_01'},
    })).rejects.toThrow();
    const wrongIssuer={
      [ISSUER_ID]:{
        enabled:true as const,
        publicKeyPem:f.outsider.publicKey.export({format:'pem',type:'spki'}) as string,
      },
    };
    await expect(f.execute(p,{trustedIssuers:wrongIssuer}))
      .rejects.toThrow('signature');
    expect(()=>f.issue({attestations:[
      {...f.attestations[0],keyId:'key_approver_002'},
      f.attestations[1],
    ]})).toThrow();
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('rejects unknown, disabled, malformed and wrong-algorithm verifier keys',async()=>{
    const f=rig();
    const p=f.issue();
    for(const registry of [
      {},
      {[ISSUER_ID]:{enabled:false,publicKeyPem:f.trustedIssuers[ISSUER_ID]!.publicKeyPem}},
      {[ISSUER_ID]:{enabled:true,publicKeyPem:'not a public key'}},
      {[ISSUER_ID]:{enabled:true,publicKeyPem:'a'.repeat(5000)}},
    ]){
      await expect(f.execute(p,{trustedIssuers:registry})).rejects.toThrow();
    }
    const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
    expect(()=>f.issue({
      issuerPrivateKeyPem:rsa.privateKey.export({format:'pem',type:'pkcs8'}) as string,
    })).toThrow('Ed25519');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('rejects expired, future-dated, malformed and extended permits before any DB call',async()=>{
    const f=rig();
    const p=f.issue();
    await expect(f.execute(p,{now:new Date('2026-10-14T05:01:01.000Z')}))
      .rejects.toThrow('expired');
    await expect(f.execute(p,{now:new Date('2026-10-14T04:59:40.000Z')}))
      .rejects.toThrow('timing');
    for(const changed of [
      {permitExpiresAt:'2026-10-14T05:10:00.000Z'},
      {permitIssuedAt:'2026-10-14T05:02:00.000Z'},
      {permitIssuedAt:'2026-10-14T05:00:00+00:00'},
      {environment:'production'},
      {protocol:'unknown'},
    ]){
      await expect(f.execute({...p,payload:{...p.payload,...changed}}))
        .rejects.toThrow();
    }
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('rejects extra fields, noncanonical base64, missing signatures and random data',async()=>{
    const f=rig();const p=f.issue();
    for(const invalid of [
      null,[],{}, {payload:p.payload},
      {...p,signatureBase64:'forged'},
      {...p,signatureBase64:p.signatureBase64.slice(0,-3)+'==='},
      {...p,extra:'user-controlled-header'},
      {...p,payload:{...p.payload,debug:'raw-card'}},
      {...p,payload:{...p.payload,command:{
        ...p.payload.command,customerId:'unexpected'},
      }},
      {...p,signatureBase64:Buffer.alloc(64).toString('base64')},
    ]){
      await expect(f.execute(invalid)).rejects.toThrow();
    }
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('rejects all SQL failure and ambiguous receipts; no success is invented',async()=>{
    const f=rig();const p=f.issue();
    await expect(f.execute(p,{store:{
      commitAuthorizedReview:async()=>{throw new Error('synthetic nonce replay');},
    }})).rejects.toThrow('nonce replay');
    for(const response of [
      null,
      {effectAuthorized:true,reviewState:'held',authorizationReceiptId:RECEIPT},
      {effectAuthorized:false,reviewState:'completed',authorizationReceiptId:RECEIPT},
      {effectAuthorized:false,reviewState:'held',authorizationReceiptId:null},
    ]){
      await expect(f.execute(p,{store:{
        commitAuthorizedReview:async()=>response,
      }})).rejects.toThrow('approval');
    }
  });

  it('cannot issue permits from forged or malformed human approvals',async()=>{
    const f=rig();
    for(const tampered of [
      {...f.statement,action:'retry_transient'},
      {...f.statement,inboxId:randomUUID()},
      {...f.statement,expiresAt:'2026-10-14T05:04:00.000Z'},
      {...f.statement,environment:'production'},
    ]){
      expect(()=>f.issue({statement:tampered})).toThrow();
    }
    expect(()=>f.issue({
      attestations:[f.attestations[0]],
    })).toThrow('two signatures');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('canonical signed bytes bind nested review action and signature digest',()=>{
    const f=rig();const p=f.issue();
    const source=canonicalPrivateCancelDetachedPermitV1(p.payload);
    expect(Buffer.from(source).toString('utf8')).toContain(
      f.statement.challengeId,
    );
    expect(Buffer.from(source).toString('utf8')).toContain(
      p.payload.command.statementDigest,
    );
  });
});
