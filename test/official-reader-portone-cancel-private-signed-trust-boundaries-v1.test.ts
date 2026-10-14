import {
  generateKeyPairSync,randomUUID,sign as edSign,
  type KeyObject,
} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {
  canonicalPrivateCancelReviewStatementV1,
  type PrivateCancelReviewAuthorizedStoreV1,
  type PrivateCancelReviewStatementV1,
} from '../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import {
  canonicalPrivateCancelIdentityAssertionV1,
  type PrivateCancelIdentityAssertionPayloadV1,
} from '../apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.js';
import {
  canonicalPrivateCancelTrustPolicyV1,
  verifyOfflinePrivateCancelSignedTrustPolicyV1,
  type PrivateCancelSignedTrustPolicyBodyV1,
  type PrivateCancelSignedTrustPolicyV1,
  type PrivateCancelTrustedRootV1,
} from '../apps/api/src/official-reader-portone-cancel-private-signed-trust-policy-v1.js';
import {
  createOfflinePrivateCancelIssuerBoundaryV1,
} from '../apps/api/src/official-reader-portone-cancel-private-offline-issuer-boundary-v1.js';
import {
  createOfflinePrivateCancelExecutorBoundaryV1,
} from '../apps/api/src/official-reader-portone-cancel-private-offline-executor-boundary-v1.js';

const ROOT_ID='root_offline_001';
const IDP_ID='idp_offline_001';
const ISSUER_ID='issuer_offline_001';
const NOW='2026-10-14T05:00:00.000Z';
const RECEIPT='00000000-0000-4000-8000-000000000090';
function pub(pair:{publicKey:KeyObject}):string{
  return pair.publicKey.export({type:'spki',format:'pem'}) as string;
}
function priv(pair:{privateKey:KeyObject}):string{
  return pair.privateKey.export({type:'pkcs8',format:'pem'}) as string;
}
function rig(){
  const root=generateKeyPairSync('ed25519');
  const requester=generateKeyPairSync('ed25519');
  const approver=generateKeyPairSync('ed25519');
  const idp=generateKeyPairSync('ed25519');
  const issuer=generateKeyPairSync('ed25519');
  const rogue=generateKeyPairSync('ed25519');
  const nowRef={value:new Date(NOW)};
  const clock=()=>new Date(nowRef.value);
  const policy:PrivateCancelSignedTrustPolicyBodyV1={
    protocol:'myeongha.cancel.ops.signed-trust-policy.v1',
    environment:'sandbox',
    audience:'myeongha.cancel.ops.offline-boundaries.v1',
    policyId:'policy_private_001',
    revision:7,
    issuedAt:'2026-10-14T04:50:00.000Z',
    expiresAt:'2026-10-14T05:10:00.000Z',
    operators:[
      {
        orgSubjectId:'org_request_001',principalId:'op_request_001',
        signingKeyId:'key_request_001',role:'requester',status:'active',
        publicKeyPem:pub(requester),
      },
      {
        orgSubjectId:'org_approve_002',principalId:'op_approve_002',
        signingKeyId:'key_approver_002',role:'approver',status:'active',
        publicKeyPem:pub(approver),
      },
    ],
    idpIssuers:[{keyId:IDP_ID,publicKeyPem:pub(idp),enabled:true}],
    permitIssuers:[{keyId:ISSUER_ID,publicKeyPem:pub(issuer),enabled:true}],
  };
  const pin:PrivateCancelTrustedRootV1={
    keyId:ROOT_ID,publicKeyPem:pub(root),minimumRevision:7,
  };
  const signPolicy=(body:PrivateCancelSignedTrustPolicyBodyV1=policy,
    key=root.privateKey):PrivateCancelSignedTrustPolicyV1=>({
    rootKeyId:ROOT_ID,policy:body,
    signatureBase64:edSign(null,canonicalPrivateCancelTrustPolicyV1(
      ROOT_ID,body,
    ),key).toString('base64'),
  });
  const envelope=signPolicy();
  const statement:PrivateCancelReviewStatementV1={
    protocol:'myeongha.cancel.ops.review.ed25519.v1',
    environment:'sandbox',inboxId:randomUUID(),action:'acknowledge',
    ticketReference:'OPS-2026101416',challengeId:randomUUID(),
    issuedAt:'2026-10-14T04:58:00.000Z',
    expiresAt:'2026-10-14T05:03:00.000Z',
  };
  const bytes=canonicalPrivateCancelReviewStatementV1(statement);
  const operatorAttestations=[
    {keyId:'key_request_001',
      signatureBase64:edSign(null,bytes,requester.privateKey).toString('base64')},
    {keyId:'key_approver_002',
      signatureBase64:edSign(null,bytes,approver.privateKey).toString('base64')},
  ];
  function identity(role:'requester'|'approver'){
    const first=role==='requester';
    const claim:PrivateCancelIdentityAssertionPayloadV1={
      protocol:'myeongha.cancel.ops.identity-assertion.v1',
      environment:'sandbox',audience:'myeongha.cancel.ops.offline-verifier.v1',
      idpKeyId:IDP_ID,orgSubjectId:first?'org_request_001':'org_approve_002',
      principalId:first?'op_request_001':'op_approve_002',role,
      signingKeyId:first?'key_request_001':'key_approver_002',
      inboxId:statement.inboxId,action:statement.action,
      ticketReference:statement.ticketReference,challengeId:statement.challengeId,
      authMethod:'phishing_resistant_mfa',
      authenticatedAt:'2026-10-14T04:59:00.000Z',
      issuedAt:'2026-10-14T04:59:30.000Z',
      expiresAt:'2026-10-14T05:02:00.000Z',
    };
    return {payload:claim,signatureBase64:edSign(null,
      canonicalPrivateCancelIdentityAssertionV1(claim),
      idp.privateKey).toString('base64')};
  }
  const identityAssertions=[identity('requester'),identity('approver')];
  const request={statement,operatorAttestations,identityAssertions};
  const store:PrivateCancelReviewAuthorizedStoreV1={
    commitAuthorizedReview:vi.fn(async()=>({
      reviewState:'held',effectAuthorized:false,authorizationReceiptId:RECEIPT,
    })),
  };
  const issuerBoot=(change:Record<string,unknown>={})=>
    createOfflinePrivateCancelIssuerBoundaryV1({
      signedPolicy:envelope,pinnedRoot:pin,issuerKeyId:ISSUER_ID,
      issuerPrivateKeyPem:priv(issuer),trustedClock:clock,...change,
    });
  const executorBoot=(change:Record<string,unknown>={})=>
    createOfflinePrivateCancelExecutorBoundaryV1({
      signedPolicy:envelope,pinnedRoot:pin,testStore:store,
      trustedClock:clock,...change,
    });
  return {
    root,requester,approver,idp,issuer,rogue,clock,nowRef,
    policy,pin,envelope,signPolicy,statement,identityAssertions,
    operatorAttestations,request,store,issuerBoot,executorBoot,
  };
}
describe('D3e14 offline signed-trust verifier and executor separation (NOT LIVE)',()=>{
  it('accepts independently root-verified policy at BOTH boundaries and a real 3-hop signature chain',async()=>{
    const f=rig();
    const verifier=f.issuerBoot();
    const executor=f.executorBoot();
    expect(Object.keys(verifier)).toEqual(['issue']);
    expect(Object.keys(executor)).toEqual(['execute']);
    const permit=verifier.issue(f.request);
    expect(permit.payload).toMatchObject({
      issuerKeyId:ISSUER_ID,environment:'sandbox',
      command:{inboxId:f.statement.inboxId,
        challengeId:f.statement.challengeId,action:'acknowledge'},
    });
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
    expect(await executor.execute({permit})).toEqual({
      reviewState:'held',approvalRecorded:true,effectAuthorized:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    expect(f.store.commitAuthorizedReview).toHaveBeenCalledOnce();
    const publicOutput=JSON.stringify({verifier,executor,permit});
    expect(publicOutput).not.toContain(priv(f.issuer));
    expect(publicOutput).not.toContain(f.identityAssertions[0]!.signatureBase64);
    expect(publicOutput).not.toContain('PRIVATE KEY');
  });
  it('rejects request-time trust roots, IdP/directory changes, signer keys and SQL store at both boundaries',async()=>{
    const f=rig(),verify=f.issuerBoot(),execute=f.executorBoot();
    for(const change of [
      {pinnedRoot:{...f.pin,publicKeyPem:pub(f.rogue)}},
      {trustedIdentityDirectory:{org_request_001:{status:'active'}}},
      {trustedOperatorKeys:{}},
      {pinnedIdpKeys:{}},
      {issuerPrivateKeyPem:priv(f.rogue)},
      {trustedClock:()=>new Date('2026-10-14T04:59:00.000Z')},
      {testStore:{commitAuthorizedReview:async()=>({effectAuthorized:true})}},
      {environment:'production'},
    ]){
      expect(()=>verify.issue({...f.request,...change})).toThrow('caller-owned trust');
    }
    const permit=verify.issue(f.request);
    for(const change of [
      {trustedIssuers:{[ISSUER_ID]:{enabled:true,publicKeyPem:pub(f.rogue)}}},
      {testStore:{commitAuthorizedReview:async()=>({effectAuthorized:true})}},
      {pinnedRoot:f.pin},
      {issuerPrivateKeyPem:priv(f.issuer)},
      {now:new Date('2026-10-14T04:59:00.000Z')},
      {permitIssuerId:ISSUER_ID},
    ]){
      await expect(execute.execute({permit,...change})).rejects.toThrow(
        'caller-supplied credentials and store',
      );
    }
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('rejects forged root, signed policy tamper, spoofed issuer, production scope and stale root revision',()=>{
    const f=rig();
    const badRoot={...f.pin,publicKeyPem:pub(f.rogue)};
    expect(()=>f.issuerBoot({pinnedRoot:badRoot})).toThrow('root signature');
    expect(()=>f.executorBoot({pinnedRoot:badRoot})).toThrow('root signature');
    const roguePolicy=f.signPolicy(f.policy,f.rogue.privateKey);
    expect(()=>f.issuerBoot({signedPolicy:roguePolicy})).toThrow('root signature');
    for(const mutation of [
      {environment:'production'},
      {audience:'myeongha.cancel.ops.refund'},
      {revision:6},
      {policyId:'wrong'},
    ]){
      const tampered={...f.envelope,
        policy:{...f.envelope.policy,...mutation}};
      expect(()=>f.issuerBoot({signedPolicy:tampered})).toThrow();
    }
    expect(()=>f.issuerBoot({pinnedRoot:{...f.pin,minimumRevision:8}}))
      .toThrow('revision');
    expect(()=>f.executorBoot({pinnedRoot:{...f.pin,minimumRevision:8}}))
      .toThrow('revision');
  });
  it('requires distinct public Ed25519 keys across both operators, IdP, verifier and trust root',()=>{
    const f=rig();
    const operators=f.policy.operators;
    const sameOperator={...f.policy,operators:[
      operators[0]!,{...operators[1]!,publicKeyPem:operators[0]!.publicKeyPem},
    ]};
    expect(()=>f.issuerBoot({signedPolicy:f.signPolicy(sameOperator)}))
      .toThrow('duplicate operator');
    for(const body of [
      {...f.policy,idpIssuers:[{
        ...f.policy.idpIssuers[0]!,publicKeyPem:pub(f.requester),
      }]},
      {...f.policy,permitIssuers:[{
        ...f.policy.permitIssuers[0]!,publicKeyPem:pub(f.idp),
      }]},
      {...f.policy,operators:[{
        ...operators[0]!,publicKeyPem:pub(f.root),
      },operators[1]!] },
    ]){
      expect(()=>f.issuerBoot({signedPolicy:f.signPolicy(body)}))
        .toThrow('reuses a cryptographic key');
    }
  });
  it('rejects signed duplicate principals, signing IDs, org IDs, inactive roles and secret key PEM',()=>{
    const f=rig(),ops=f.policy.operators;
    for(const field of ['orgSubjectId','principalId','signingKeyId'] as const){
      const updated={...ops[1]!,[field]:ops[0]![field]};
      expect(()=>f.issuerBoot({signedPolicy:f.signPolicy({
        ...f.policy,operators:[ops[0]!,updated],
      })})).toThrow('duplicate operator');
    }
    expect(()=>f.issuerBoot({signedPolicy:f.signPolicy({
      ...f.policy,operators:[ops[0]!,{...ops[1]!,status:'disabled'}],
    })})).toThrow('independent active roles');
    expect(()=>f.issuerBoot({signedPolicy:f.signPolicy({
      ...f.policy,operators:[{...ops[0]!,publicKeyPem:priv(f.requester)},ops[1]!],
    })})).toThrow('invalid operator');
  });
  it('rejects invalid root signature, extra fields, wrong key algorithm, duplicate IdP and unknown issuer',()=>{
    const f=rig();
    for(const envelope of [
      {...f.envelope,extra:'untrusted'},
      {...f.envelope,signatureBase64:'fake'},
      {...f.envelope,policy:{...f.policy,rawCredential:'secret'}},
      {...f.envelope,policy:{...f.policy,operators:[
        {...f.policy.operators[0]!,extra:'email'},f.policy.operators[1]!,
      ]}},
    ]){
      expect(()=>f.issuerBoot({signedPolicy:envelope})).toThrow();
    }
    expect(()=>f.issuerBoot({signedPolicy:f.signPolicy({
      ...f.policy,idpIssuers:[
        f.policy.idpIssuers[0]!,f.policy.idpIssuers[0]!,
      ],
    })})).toThrow('duplicate IdP');
    expect(()=>f.issuerBoot({issuerKeyId:'issuer_unknown_001'}))
      .toThrow('not active');
    expect(()=>f.issuerBoot({issuerPrivateKeyPem:priv(f.rogue)}))
      .toThrow('private key mismatch');
  });
  it('rejects short-lived expired signed policy on both boundaries even if permit has not expired',async()=>{
    const f=rig();
    const verifier=f.issuerBoot(),executor=f.executorBoot();
    const permit=verifier.issue(f.request);
    f.nowRef.value=new Date('2026-10-14T05:11:00.000Z');
    expect(()=>verifier.issue(f.request)).toThrow('expired');
    await expect(executor.execute({permit})).rejects.toThrow('expired');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('isolates an immutable policy snapshot against caller mutation AFTER bootstrap',async()=>{
    const f=rig();
    const verifier=f.issuerBoot(),executor=f.executorBoot();
    (f.envelope.policy.operators as unknown as Array<{status:string}>)[0]!.status='disabled';
    (f.envelope.policy.permitIssuers as unknown as Array<{enabled:boolean}>)[0]!.enabled=false;
    const permit=verifier.issue(f.request);
    expect(await executor.execute({permit})).toMatchObject({
      approvalRecorded:true,effectAuthorized:false,
    });
  });
  it('cannot turn identity-disabled signed policy into a valid permit by supplying per-request overrides',()=>{
    const f=rig();
    const updated=f.signPolicy({
      ...f.policy,operators:[
        f.policy.operators[0]!,
        {...f.policy.operators[1]!,status:'disabled'},
      ],
    });
    expect(()=>f.issuerBoot({signedPolicy:updated}))
      .toThrow('independent active roles');
    // This offline gate does NOT dynamically revoke keys on an existing boot:
    // signed policy expiry and min revision remain the only local fences.
  });
  it('executor cannot override signed issuer public key even with its own signed wrong-issuer permit',async()=>{
    const f=rig();
    const issuer=f.issuerBoot(),executor=f.executorBoot();
    const original=issuer.issue(f.request);
    await expect(executor.execute({permit:{
      ...original,signatureBase64:edSign(null,Buffer.from('fake'),
        f.rogue.privateKey).toString('base64'),
    }})).rejects.toThrow('signature');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('SQL error or ambiguous DB owner receipt is never interpreted as approval',async()=>{
    const f=rig(),issuer=f.issuerBoot();
    const permit=issuer.issue(f.request);
    const fail=f.executorBoot({
      testStore:{commitAuthorizedReview:async()=>{throw new Error('DB unavailable');}},
    });
    await expect(fail.execute({permit})).rejects.toThrow('DB unavailable');
    const contradictory=f.executorBoot({
      testStore:{commitAuthorizedReview:async()=>({
        reviewState:'held',effectAuthorized:true,authorizationReceiptId:RECEIPT,
      })},
    });
    await expect(contradictory.execute({permit})).rejects.toThrow('approval');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
});
