import {
  generateKeyPairSync,randomUUID,sign,
} from 'node:crypto';
import { describe,expect,it,vi } from 'vitest';
import {
  canonicalPrivateCancelReviewStatementV1,
  commitPrivateCancelDualApprovedReviewV1,
  type PrivateCancelReviewStatementV1,
  type PrivateCancelReviewTrustRegistryV1,
  type PrivateCancelReviewAuthorizedStoreV1,
} from '../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import { createPrivateCancelDualApprovalStoreTestV1 } from './support/private-official-reader-cancel-dual-approval-store-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW=new Date('2026-10-14T03:00:00.000Z');
const RESPONSE_ID='00000000-0000-4000-8000-000000000090';
const PROTOCOL='myeongha.cancel.ops.review.ed25519.v1';

function fixture(action:'acknowledge'|'retry_transient'='acknowledge') {
  const requester=generateKeyPairSync('ed25519');
  const approver=generateKeyPairSync('ed25519');
  const attacker=generateKeyPairSync('ed25519');
  const statement:PrivateCancelReviewStatementV1={
    protocol:PROTOCOL,environment:'sandbox',inboxId:randomUUID(),
    action,ticketReference:'OPS-2026101401',challengeId:randomUUID(),
    issuedAt:'2026-10-14T02:58:00.000Z',
    expiresAt:'2026-10-14T03:03:00.000Z',
  };
  const trustedKeys:PrivateCancelReviewTrustRegistryV1={
    key_request_001:{
      role:'requester',principalId:'op_request_001',
      publicKeyPem:requester.publicKey.export({format:'pem',type:'spki'}) as string,
      enabled:true,
    },
    key_approver_002:{
      role:'approver',principalId:'op_approve_002',
      publicKeyPem:approver.publicKey.export({format:'pem',type:'spki'}) as string,
      enabled:true,
    },
  };
  const makeAttestations=(claim:PrivateCancelReviewStatementV1=statement)=>[
    {keyId:'key_request_001',signatureBase64:sign(null,
      canonicalPrivateCancelReviewStatementV1(claim),requester.privateKey).toString('base64')},
    {keyId:'key_approver_002',signatureBase64:sign(null,
      canonicalPrivateCancelReviewStatementV1(claim),approver.privateKey).toString('base64')},
  ];
  const records:unknown[]=[];
  const store:PrivateCancelReviewAuthorizedStoreV1={
    commitAuthorizedReview:vi.fn(async input=>{
      records.push(input);
      return {
        reviewState:action==='retry_transient'?'queued':'held',
        authorizationReceiptId:RESPONSE_ID,effectAuthorized:false,
      };
    }),
  };
  return {
    statement,trustedKeys,attestations:makeAttestations(),makeAttestations,
    requester,approver,attacker,store,records,
    run:(
      options:Partial<{
        statement:unknown; attestations:readonly unknown[];
        trustedKeys:PrivateCancelReviewTrustRegistryV1;
        now:Date; store:PrivateCancelReviewAuthorizedStoreV1;
      }>={},
    )=>commitPrivateCancelDualApprovedReviewV1({
      statement:options.statement??statement,
      attestations:options.attestations??makeAttestations(),
      trustedKeys:options.trustedKeys??trustedKeys,
      now:options.now??NOW,
      store:options.store??store,
    }),
  };
}

describe('D3e8 sandbox-only dual-signed cancel operator preflight',()=>{
  it.each(['acknowledge','retry_transient'] as const)(
    'accepts two independently verified Ed25519 signatures before committing %s',
    async action=>{
      const f=fixture(action);
      const answer=await f.run();
      expect(answer).toEqual({
        reviewState:action==='retry_transient'?'queued':'held',
        approvalRecorded:true,effectAuthorized:false,
        providerRefundAuthorized:false,entitlementMutationAuthorized:false,
      });
      expect(f.records).toHaveLength(1);
      const record=f.records[0] as Record<string,unknown>;
      expect(record).toMatchObject({
        inboxId:f.statement.inboxId,action,
        challengeId:f.statement.challengeId,
        requesterKeyId:'key_request_001',
        approverKeyId:'key_approver_002',
        requesterPrincipalId:'op_request_001',
        approverPrincipalId:'op_approve_002',
      });
      expect(record.statementDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
      const str=JSON.stringify(record);
      expect(str).not.toContain(f.attestations[0]!.signatureBase64);
      expect(str).not.toContain(f.attestations[1]!.signatureBase64);
      expect(str).not.toContain('PRIVATE KEY');
    },
  );

  it('signature tied to exact action, inbox ID, ticket, challenge and expiration',async()=>{
    for(const field of [
      {action:'retry_transient'},
      {inboxId:randomUUID()},
      {ticketReference:'OPS-99999999'},
      {challengeId:randomUUID()},
      {expiresAt:'2026-10-14T03:04:00.000Z'},
    ]){
      const f=fixture();
      await expect(f.run({statement:{...f.statement,...field}})).rejects.toThrow('signature');
      expect(f.records).toHaveLength(0);
    }
  });

  it('rejects malicious signer-provided public key (registry trust only)',async()=>{
    const f=fixture();
    const attackerSignature=sign(null,
      canonicalPrivateCancelReviewStatementV1(f.statement),f.attacker.privateKey
    ).toString('base64');
    await expect(f.run({attestations:[
      {keyId:'key_request_001',signatureBase64:attackerSignature},
      f.attestations[1],
    ]})).rejects.toThrow('signature verification');
    expect(f.records).toHaveLength(0);
  });

  it('rejects swapped roles, same principal on two keys and disabled keys',async()=>{
    const f=fixture();
    await expect(f.run({attestations:[f.attestations[1],f.attestations[0]]}))
      .rejects.toThrow('not independently trusted');
    const same:PrivateCancelReviewTrustRegistryV1={
      ...f.trustedKeys,
      key_approver_002:{...f.trustedKeys.key_approver_002!,
        principalId:'op_request_001'},
    };
    await expect(f.run({trustedKeys:same})).rejects.toThrow('distinct trusted principals');
    const inactive:PrivateCancelReviewTrustRegistryV1={
      ...f.trustedKeys,
      key_approver_002:{...f.trustedKeys.key_approver_002!,
        enabled:false as never},
    };
    await expect(f.run({trustedKeys:inactive})).rejects.toThrow('not independently trusted');
    expect(f.records).toHaveLength(0);
  });

  it('rejects invalid signature encoding, missing approvals and extra fields',async()=>{
    const f=fixture();
    for(const attestations of [
      [],[f.attestations[0]],[f.attestations[0],f.attestations[1],f.attestations[1]],
      [f.attestations[0],{...f.attestations[1],signatureBase64:'not valid'}],
      [f.attestations[0],{...f.attestations[1],publicKey:'untrusted'}],
    ]){
      await expect(f.run({attestations})).rejects.toThrow();
    }
    await expect(f.run({statement:{...f.statement,merchantId:'untrusted-data'}}))
      .rejects.toThrow('shape');
    expect(f.records).toHaveLength(0);
  });

  it('rejects production, non-UTC timestamps, future-dated and expired approvals',async()=>{
    for(const changes of [
      {environment:'production'},{issuedAt:'2026-10-14T02:00:00.000Z'},
      {expiresAt:'2026-10-14T02:59:59.000Z'},
      {issuedAt:'2026-10-14T03:02:00.000Z'},
      {issuedAt:'2026-10-14T02:51:00.000Z',expiresAt:'2026-10-14T03:03:00.000Z'},
      {issuedAt:'2026-10-14T02:58:00+00:00'},
    ]){
      const f=fixture();
      await expect(f.run({statement:{...f.statement,...changes}})).rejects.toThrow();
      expect(f.records).toHaveLength(0);
    }
  });

  it('requires valid sandbox ticket, action, known key IDs and external dependencies',async()=>{
    for(const changes of [
      {ticketReference:'FREE TEXT'}, {action:'refund_now'},
      {protocol:'myeongha.cancel.ops.review.unknown'},
    ]){
      const f=fixture();
      await expect(f.run({statement:{...f.statement,...changes}})).rejects.toThrow();
      expect(f.records).toHaveLength(0);
    }
    const f=fixture();
    await expect(f.run({store:{} as never})).rejects.toThrow('dependencies');
  });

  it('never claims successful review when the DB failed, rejected or returned rights flags',async()=>{
    const f=fixture();
    await expect(f.run({store:{
      commitAuthorizedReview:async()=>{throw new Error('synthetic SQL nonce conflict');},
    }})).rejects.toThrow('nonce conflict');
    for(const response of [
      null,{reviewState:'queued',effectAuthorized:true,authorizationReceiptId:RESPONSE_ID},
      {reviewState:'completed',effectAuthorized:false,authorizationReceiptId:RESPONSE_ID},
      {reviewState:'held',effectAuthorized:false,authorizationReceiptId:null},
    ]){
      await expect(f.run({store:{commitAuthorizedReview:async()=>response}}))
        .rejects.toThrow('approval');
    }
  });

  it('only uses explicit owner-only SQL 1950 function, never an implicit D3e6 shortcut',async()=>{
    const sql=vi.fn(async(_sql:string,values:readonly unknown[])=>{
      expect(values).toHaveLength(11);
      return {rows:[{
        reviewState:'held',authorizationReceiptId:RESPONSE_ID,effectAuthorized:false,
      }]};
    });
    const adapter=createPrivateCancelDualApprovalStoreTestV1({
      connect:async()=>({query:sql,release:()=>undefined}),
    } as unknown as PostgresSubjectPoolV1);
    const f=fixture();
    expect((await f.run({store:adapter})).approvalRecorded).toBe(true);
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]?.[0]).toContain('internal_private_cancel_commit_review_approval_v1');
    expect(sql.mock.calls[0]?.[0]).not.toContain('internal_private_cancel_review_v1(');
  });
});
