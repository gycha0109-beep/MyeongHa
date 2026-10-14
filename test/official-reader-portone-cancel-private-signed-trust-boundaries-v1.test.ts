import {
  generateKeyPairSync,randomUUID,sign as edSign,
  type KeyObject,
} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {canonicalPrivateCancelPermitPolicyBindingV1} from '../apps/api/src/official-reader-portone-cancel-private-policy-bound-permit-v1.js';
import {readFileSync} from 'node:fs';
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
  it('enforces source-level verifier/executor capability separation and no LIVE SQL grant',()=>{
    const issuer=readFileSync(
      'apps/api/src/official-reader-portone-cancel-private-offline-issuer-boundary-v1.ts',
      'utf8',
    );
    const executor=readFileSync(
      'apps/api/src/official-reader-portone-cancel-private-offline-executor-boundary-v1.ts',
      'utf8',
    );
    const core=readFileSync(
      'apps/api/src/official-reader-portone-cancel-private-signed-trust-policy-v1.ts',
      'utf8',
    );
    expect(issuer).toContain('issueIdentityBoundSandboxPrivateCancelPermitV1');
    expect(issuer).not.toContain('commitAuthorizedReview(');
    expect(issuer).not.toContain('executeSandboxPrivateCancelReviewPermitV1');
    expect(executor).toContain('executeSandboxPrivateCancelReviewPermitV1');
    expect(executor).not.toMatch(/\bcreatePrivateKey\s*\(/u);
    expect(executor).not.toContain('issuerPrivateKeyPem');
    expect(executor).not.toContain('issueIdentityBoundSandboxPrivateCancelPermitV1');
    expect(executor).not.toContain('verifyOfflinePrivateCancelIdentityPairV1');
    expect(executor).not.toContain('trustedIdentityDirectory');
    expect(executor).not.toContain('pinnedIdpKeys');
    expect(core).not.toMatch(/\b(?:grant\s+execute|security\s+definer|refund)\b/iu);
  });
  it('D3e15 binds both permit signatures to verified policy root, revision and SHA256 snapshot',async()=>{
    const f=rig(),issuer=f.issuerBoot(),executor=f.executorBoot();
    const permit=issuer.issue(f.request);
    expect(permit.policyBinding).toMatchObject({
      protocol:'myeongha.cancel.ops.policy-bound-permit.v1',
      environment:'sandbox',
      rootKeyId:ROOT_ID,
      policyId:'policy_private_001',
      policyRevision:7,
      issuerKeyId:ISSUER_ID,
    });
    expect(permit.policyBinding.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(permit.policyBinding.permitDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(permit.policyBindingSignatureBase64).toMatch(/^[A-Za-z0-9+/]{86}==$/u);
    expect(permit.policyBinding.policyDigest)
      .not.toBe(permit.policyBinding.permitDigest);
    expect(await executor.execute({permit})).toMatchObject({
      approvalRecorded:true,effectAuthorized:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
  });

  it('D3e15 refuses legacy D3e10 permits without bound policy and unknown outer fields',async()=>{
    const f=rig(),signed=f.issuerBoot().issue(f.request),executor=f.executorBoot();
    const legacy={payload:signed.payload,signatureBase64:signed.signatureBase64};
    await expect(executor.execute({permit:legacy})).rejects.toThrow('envelope');
    await expect(executor.execute({permit:{
      ...signed,debug:'attacker-token',
    }})).rejects.toThrow('envelope');
    await expect(executor.execute({permit:{
      ...signed,policyBinding:{...signed.policyBinding,freeText:'untrusted'},
    }})).rejects.toThrow('envelope');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 rejects root, revision, digest, purpose and issuer substitutions BEFORE DB',async()=>{
    const f=rig(),permit=f.issuerBoot().issue(f.request),executor=f.executorBoot();
    const mutations=[
      {rootKeyId:'root_attacker_001'},
      {policyId:'policy_wrong_001'},
      {policyRevision:8},
      {policyDigest:'sha256:'+'b'.repeat(64)},
      {permitDigest:'sha256:'+'a'.repeat(64)},
      {issuerKeyId:'issuer_attacker_001'},
      {environment:'production'},
      {protocol:'myeongha.cancel.ops.unknown.v1'},
    ];
    for(const changed of mutations){
      await expect(executor.execute({permit:{
        ...permit,policyBinding:{...permit.policyBinding,...changed},
      }})).rejects.toThrow();
    }
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 rejects tampered inner signature/claim and forged outer Ed25519 signature',async()=>{
    const f=rig(),permit=f.issuerBoot().issue(f.request),executor=f.executorBoot();
    const forged=edSign(null,
      canonicalPrivateCancelPermitPolicyBindingV1(permit.policyBinding),
      f.rogue.privateKey,
    ).toString('base64');
    for(const invalid of [
      {...permit,policyBindingSignatureBase64:forged},
      {...permit,signatureBase64:forged},
      {...permit,payload:{...permit.payload,issuerKeyId:'issuer_attacker_001'}},
      {...permit,payload:{...permit.payload,command:{
        ...permit.payload.command,ticketReference:'OPS-99999999',
      }}},
      {...permit,policyBindingSignatureBase64:'not-base64'},
    ]){
      await expect(executor.execute({permit:invalid})).rejects.toThrow();
    }
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 rejects an old unexpired permit after signed revision rotation and accepts a new one',async()=>{
    const f=rig(),prior=f.issuerBoot().issue(f.request);
    const rotated=f.signPolicy({...f.policy,revision:8});
    const nextRoot={...f.pin,minimumRevision:8};
    const freshExecutor=f.executorBoot({
      signedPolicy:rotated,pinnedRoot:nextRoot,
    });
    await expect(freshExecutor.execute({permit:prior})).rejects.toThrow(
      'ACTIVE signed policy',
    );
    const freshIssuer=f.issuerBoot({
      signedPolicy:rotated,pinnedRoot:nextRoot,
    });
    const current=freshIssuer.issue(f.request);
    expect(current.policyBinding.policyRevision).toBe(8);
    expect(current.policyBinding.policyDigest)
      .not.toBe(prior.policyBinding.policyDigest);
    expect(await freshExecutor.execute({permit:current})).toMatchObject({
      approvalRecorded:true,effectAuthorized:false,
    });
    expect(f.store.commitAuthorizedReview).toHaveBeenCalledOnce();
  });

  it('D3e15 rejects SAME-revision signed policy replacements by canonical digest',async()=>{
    const f=rig(),old=f.issuerBoot().issue(f.request);
    const replaced=f.signPolicy({
      ...f.policy,
      idpIssuers:[{
        ...f.policy.idpIssuers[0]!,
        publicKeyPem:pub(f.rogue),
      }],
    });
    const next=f.executorBoot({signedPolicy:replaced});
    await expect(next.execute({permit:old})).rejects.toThrow(
      'ACTIVE signed policy',
    );
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 rejects retired permit signing key under independently signed replacement policy',async()=>{
    const f=rig(),old=f.issuerBoot().issue(f.request);
    const rotated=f.signPolicy({
      ...f.policy,revision:8,
      permitIssuers:[
        {...f.policy.permitIssuers[0]!,enabled:false},
        {keyId:'issuer_rotated_002',publicKeyPem:pub(f.rogue),enabled:true},
      ],
    });
    const nextRoot={...f.pin,minimumRevision:8};
    const next=f.executorBoot({signedPolicy:rotated,pinnedRoot:nextRoot});
    await expect(next.execute({permit:old})).rejects.toThrow(
      'ACTIVE signed policy',
    );
    expect(()=>f.issuerBoot({signedPolicy:rotated,pinnedRoot:nextRoot}))
      .toThrow('not active');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 rejects a permit from the old policy root after independently signed root rotation',async()=>{
    const f=rig(),old=f.issuerBoot().issue(f.request);
    const nextRoot=generateKeyPairSync('ed25519');
    const rootId='root_rotated_002';
    const signed={
      rootKeyId:rootId,policy:f.policy,
      signatureBase64:edSign(null,canonicalPrivateCancelTrustPolicyV1(
        rootId,f.policy,
      ),nextRoot.privateKey).toString('base64'),
    };
    const next=f.executorBoot({
      signedPolicy:signed,
      pinnedRoot:{keyId:rootId,publicKeyPem:pub(nextRoot),minimumRevision:7},
    });
    await expect(next.execute({permit:old})).rejects.toThrow(
      'ACTIVE signed policy',
    );
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });

  it('D3e15 does NOT claim instantaneous revocation of a stale already-running executor',async()=>{
    const f=rig(),oldExecutor=f.executorBoot();
    const unexpired=f.issuerBoot().issue(f.request);
    const replacement=f.signPolicy({...f.policy,revision:8});
    const freshExecutor=f.executorBoot({
      signedPolicy:replacement,
      pinnedRoot:{...f.pin,minimumRevision:8},
    });
    await expect(freshExecutor.execute({permit:unexpired})).rejects.toThrow(
      'ACTIVE signed policy',
    );
    // Explicit limitation: without a trusted push/watch/kill-switch to the
    // already-running process, its old boot snapshot remains accepted until
    // its signed 60-second permit and policy expiry checks reject it.
    expect(await oldExecutor.execute({permit:unexpired})).toMatchObject({
      approvalRecorded:true,effectAuthorized:false,
    });
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
