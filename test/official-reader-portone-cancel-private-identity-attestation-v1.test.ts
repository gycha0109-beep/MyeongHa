import {generateKeyPairSync,randomUUID,sign as edSign} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {canonicalPrivateCancelReviewStatementV1,
  type PrivateCancelReviewStatementV1,
  type PrivateCancelReviewAuthorizedStoreV1,
} from '../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import {executeSandboxPrivateCancelReviewPermitV1} from
  '../apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.js';
import {
  canonicalPrivateCancelIdentityAssertionV1,
  issueIdentityBoundSandboxPrivateCancelPermitV1,
  verifyOfflinePrivateCancelIdentityPairV1,
  type PrivateCancelIdentityAssertionPayloadV1,
} from '../apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.js';

const NOW=new Date('2026-10-14T05:00:00.000Z');
const IDP='idp_offline_001', ISSUER='issuer_offline_01';
const RECEIPT='00000000-0000-4000-8000-000000000089';

function setup(){
  const requester=generateKeyPairSync('ed25519');
  const approver=generateKeyPairSync('ed25519');
  const idp=generateKeyPairSync('ed25519');
  const permitIssuer=generateKeyPairSync('ed25519');
  const outsider=generateKeyPairSync('ed25519');
  const statement:PrivateCancelReviewStatementV1={
    protocol:'myeongha.cancel.ops.review.ed25519.v1',
    environment:'sandbox',inboxId:randomUUID(),action:'acknowledge',
    ticketReference:'OPS-2026101412',challengeId:randomUUID(),
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
  const trustedOperatorKeys={
    key_request_001:{role:'requester' as const,principalId:'op_request_001',
      enabled:true as const,
      publicKeyPem:requester.publicKey.export({type:'spki',format:'pem'}) as string},
    key_approver_002:{role:'approver' as const,principalId:'op_approve_002',
      enabled:true as const,
      publicKeyPem:approver.publicKey.export({type:'spki',format:'pem'}) as string},
  };
  const pinnedIdpKeys={
    [IDP]:{enabled:true,
      publicKeyPem:idp.publicKey.export({type:'spki',format:'pem'}) as string},
  };
  const trustedIdentityDirectory={
    org_request_001:{principalId:'op_request_001',
      signingKeyId:'key_request_001',role:'requester' as const,status:'active' as const},
    org_approve_002:{principalId:'op_approve_002',
      signingKeyId:'key_approver_002',role:'approver' as const,status:'active' as const},
  };
  function assert(role:'requester'|'approver',
    changed:Partial<PrivateCancelIdentityAssertionPayloadV1>={},
    signingKey=idp.privateKey){
    const isRequester=role==='requester';
    const payload:PrivateCancelIdentityAssertionPayloadV1={
      protocol:'myeongha.cancel.ops.identity-assertion.v1',
      environment:'sandbox',
      audience:'myeongha.cancel.ops.offline-verifier.v1',
      idpKeyId:IDP,
      orgSubjectId:isRequester?'org_request_001':'org_approve_002',
      principalId:isRequester?'op_request_001':'op_approve_002',
      role,
      signingKeyId:isRequester?'key_request_001':'key_approver_002',
      inboxId:statement.inboxId,action:statement.action,
      ticketReference:statement.ticketReference,challengeId:statement.challengeId,
      authMethod:'phishing_resistant_mfa',
      authenticatedAt:'2026-10-14T04:59:00.000Z',
      issuedAt:'2026-10-14T04:59:30.000Z',
      expiresAt:'2026-10-14T05:02:00.000Z',
      ...changed,
    };
    return {payload,signatureBase64:edSign(null,
      canonicalPrivateCancelIdentityAssertionV1(payload),
      signingKey).toString('base64')};
  }
  const identityAssertions=[assert('requester'),assert('approver')];
  const store:PrivateCancelReviewAuthorizedStoreV1={
    commitAuthorizedReview:vi.fn(async()=>({
      reviewState:'held',authorizationReceiptId:RECEIPT,effectAuthorized:false,
    })),
  };
  const trustedIssuers={
    [ISSUER]:{
      publicKeyPem:permitIssuer.publicKey.export({type:'spki',format:'pem'}) as string,
      enabled:true as const,
    },
  };
  const config=()=>({
    statement,operatorAttestations,identityAssertions,trustedOperatorKeys,
    pinnedIdpKeys,trustedIdentityDirectory,
    issuerKeyId:ISSUER,
    issuerPrivateKeyPem:permitIssuer.privateKey.export({
      type:'pkcs8',format:'pem'}) as string,
    now:NOW,
  });
  const verify=(changed:Record<string,unknown>={})=>
    verifyOfflinePrivateCancelIdentityPairV1({...config(),...changed});
  const issue=(changed:Record<string,unknown>={})=>
    issueIdentityBoundSandboxPrivateCancelPermitV1({...config(),...changed});
  const execute=(permit:unknown,changed:Record<string,unknown>={})=>
    executeSandboxPrivateCancelReviewPermitV1({
      permit,trustedIssuers,store,now:NOW,...changed,
    });
  return {assert,identityAssertions,statement,operatorAttestations,
    pinnedIdpKeys,trustedIdentityDirectory,trustedOperatorKeys,idp,
    outsider,store,verify,issue,execute,config};
}
describe('D3e12 isolated IdP-attested operator identity gate (NOT real SSO)',()=>{
  it('accepts two distinct active org subjects with fresh IdP signatures AND operator proofs',async()=>{
    const f=setup();
    expect(f.verify()).toMatchObject({
      action:'acknowledge',inboxId:f.statement.inboxId,
      requesterKeyId:'key_request_001',approverKeyId:'key_approver_002',
    });
    const permit=f.issue();
    expect(permit.payload).toMatchObject({
      environment:'sandbox',issuerKeyId:ISSUER,
      command:{challengeId:f.statement.challengeId},
    });
    expect(permit.signatureBase64).toMatch(/^[A-Za-z0-9+/]{86}==$/u);
    expect(await f.execute(permit)).toEqual({
      reviewState:'held',approvalRecorded:true,effectAuthorized:false,
      providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    expect(f.store.commitAuthorizedReview).toHaveBeenCalledOnce();
    const wire=JSON.stringify(permit);
    expect(wire).not.toContain(f.identityAssertions[0]!.signatureBase64);
    expect(wire).not.toContain(f.identityAssertions[1]!.signatureBase64);
    expect(wire).not.toContain('PRIVATE KEY');
    expect(wire).not.toContain('email');
  });
  it('rejects IdP assertion tampering and wrong pinned IdP public key before issuance',()=>{
    const f=setup();
    const fake=f.assert('requester',{},f.outsider.privateKey);
    expect(()=>f.issue({identityAssertions:[fake,f.identityAssertions[1]]}))
      .toThrow('signature');
    for (const field of [
      {ticketReference:'OPS-999999999'},
      {inboxId:randomUUID()},
      {challengeId:randomUUID()},
      {role:'approver'},
      {orgSubjectId:'org_other_999'},
      {action:'retry_transient'},
      {authMethod:'password'},
    ]){
      const altered={...f.identityAssertions[0]!,
        payload:{...f.identityAssertions[0]!.payload,...field}};
      expect(()=>f.issue({identityAssertions:[altered,f.identityAssertions[1]]}))
        .toThrow();
    }
    const differentIdp={
      [IDP]:{enabled:true,publicKeyPem:
        f.outsider.publicKey.export({type:'spki',format:'pem'}) as string},
    };
    expect(()=>f.issue({pinnedIdpKeys:differentIdp})).toThrow('signature');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('fails closed when independent directory disabled, rotates key or changes role',()=>{
    const f=setup();
    for (const changed of [
      {status:'disabled'},
      {principalId:'op_intruder_99'},
      {signingKeyId:'key_rotated_999'},
      {role:'approver'},
    ]){
      const directory={
        ...f.trustedIdentityDirectory,
        org_request_001:{...f.trustedIdentityDirectory.org_request_001,
          ...changed},
      };
      expect(()=>f.issue({trustedIdentityDirectory:directory}))
        .toThrow('disabled or not assigned');
    }
    expect(()=>f.issue({trustedIdentityDirectory:{}}))
      .toThrow('disabled or not assigned');
    expect(()=>f.issue({pinnedIdpKeys:{
      [IDP]:{...f.pinnedIdpKeys[IDP]!,enabled:false},
    }})).toThrow('not pinned');
  });
  it('rejects same operator signature, exchanged IdP role assertions and forged identity',()=>{
    const f=setup();
    expect(()=>f.issue({identityAssertions:[
      f.identityAssertions[1],f.identityAssertions[0],
    ]})).toThrow('assurance/scope');
    expect(()=>f.issue({operatorAttestations:[
      f.operatorAttestations[0],f.operatorAttestations[0],
    ]})).toThrow();
    expect(()=>f.issue({operatorAttestations:[]}))
      .toThrow('two signatures');
    expect(()=>f.issue({identityAssertions:[
      f.assert('requester',{principalId:'op_rogue_999'}),
      f.identityAssertions[1],
    ]})).toThrow('does not bind');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('strictly binds action, ticket, challenge and original human statement',()=>{
    const f=setup();
    const variants=[
      {inboxId:randomUUID()},
      {action:'retry_transient'},
      {ticketReference:'OPS-42424242'},
      {challengeId:randomUUID()},
      {expiresAt:'2026-10-14T05:04:00.000Z'},
    ];
    for(const change of variants){
      const forged={...f.statement,...change};
      expect(()=>f.issue({statement:forged})).toThrow();
    }
    expect(()=>f.issue({identityAssertions:[
      f.assert('requester',{ticketReference:'OPS-7777777'}),
      f.identityAssertions[1],
    ]})).toThrow('does not bind');
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
  });
  it('rejects expired authentication, stale assertion, future timestamps or long TTL',()=>{
    for(const modification of [
      {authenticatedAt:'2026-10-14T04:54:00.000Z'},
      {authenticatedAt:'2026-10-14T05:00:50.000Z'},
      {issuedAt:'2026-10-14T05:00:40.000Z'},
      {issuedAt:'2026-10-14T04:54:00.000Z'},
      {expiresAt:'2026-10-14T04:59:59.000Z'},
      {expiresAt:'2026-10-14T05:04:00.000Z'},
      {issuedAt:'2026-10-14T04:59:30.000Z',
        expiresAt:'2026-10-14T05:05:00.000Z'},
      {authenticatedAt:'2026-10-14T04:59:00+00:00'},
      {authenticatedAt:'2026-10-14T04:59:40.000Z',
        issuedAt:'2026-10-14T04:59:30.000Z'},
    ]){
      const f=setup();
      expect(()=>f.issue({identityAssertions:[
        f.assert('requester',modification as never),f.identityAssertions[1],
      ]})).toThrow();
      expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
    }
  });
  it('rejects wrong audience/purpose, production environment and unrecognized policy fields',()=>{
    const f=setup();
    for(const claim of [
      {audience:'myeongha.payment.refund'},
      {environment:'production'},
      {protocol:'myeongha.cancel.ops.untrusted'},
      {authMethod:'password'},
      {idpKeyId:'idp_not_trusted'},
    ]){
      expect(()=>f.issue({identityAssertions:[
        f.assert('requester',claim as never),
        f.identityAssertions[1],
      ]})).toThrow();
    }
    const extra={
      ...f.identityAssertions[0],
      payload:{...f.identityAssertions[0]!.payload,email:'person@example.com'},
    };
    expect(()=>f.issue({identityAssertions:[extra,f.identityAssertions[1]]}))
      .toThrow('shape');
  });
  it('rejects malformed signatures, extra envelope fields, missing assertions and invalid dependencies',()=>{
    const f=setup();
    for(const assertions of [
      [],
      [f.identityAssertions[0]],
      [...f.identityAssertions,f.identityAssertions[0]],
      [{...f.identityAssertions[0],signatureBase64:'bad'},f.identityAssertions[1]],
      [{...f.identityAssertions[0],extra:'untrusted'},f.identityAssertions[1]],
      [null,f.identityAssertions[1]],
    ]){
      expect(()=>f.issue({identityAssertions:assertions})).toThrow();
    }
    expect(()=>f.issue({pinnedIdpKeys:null})).toThrow('trusted assertions');
    expect(()=>f.issue({trustedIdentityDirectory:[]})).toThrow('trusted assertions');
    expect(()=>f.issue({now:new Date(Number.NaN)})).toThrow();
  });
  it('does not treat signed IdP assertion as DB authority and fails on ambiguous SQL',async()=>{
    const f=setup();
    const permit=f.issue();
    expect(f.store.commitAuthorizedReview).not.toHaveBeenCalled();
    await expect(f.execute(permit,{
      store:{commitAuthorizedReview:async()=>{throw new Error('DB unavailable');}},
    })).rejects.toThrow('DB unavailable');
    await expect(f.execute(permit,{
      store:{commitAuthorizedReview:async()=>({
        reviewState:'held',effectAuthorized:true,authorizationReceiptId:RECEIPT,
      })},
    })).rejects.toThrow('approval');
  });
});
