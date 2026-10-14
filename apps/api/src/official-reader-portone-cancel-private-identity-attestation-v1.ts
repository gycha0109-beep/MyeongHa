/**
 * D3e12 PRIVATE/OFFLINE identity attestation gate (no production IdP).
 *
 * D3e8 proves possession of two different Ed25519 operator keys.
 * Here we ALSO require the two key holders to match independently provisioned
 * organizational subject/role assignments and individually signed, fresh,
 * phishing-resistant authentication assertions from a PINNED IdP issuer.
 *
 * This is a FAKE/ISOLATED cryptographic policy fixture. It is NOT real SSO,
 * an independent service process, reliable proof of two natural persons,
 * a database authorization layer or a LIVE payment permission.
 *
 * NOTE: The older D3e10 issuer function remains callable in test code and
 * bypasses this optional offline gate. No runtime route grants issuance rights;
 * production requires removal/closure of that path and independent identity
 * provisioning, issuer key custody, and DB privileges before enabling it.
 */
import {createPublicKey, verify as edVerify} from 'node:crypto';
import {
  verifyPrivateCancelDualSignaturesV1,
  type PrivateCancelReviewActionV1,
  type PrivateCancelReviewRoleV1,
  type PrivateCancelReviewTrustedKeyV1,
  type PrivateCancelVerifiedReviewCommandV1,
} from './official-reader-portone-cancel-private-dual-approval-v1.js';
import {
  issueSandboxPrivateCancelReviewPermitV1,
  type PrivateCancelDetachedPermitV1,
} from './official-reader-portone-cancel-detached-permit-private-v1.js';

export type PrivateCancelIdentityAssertionPayloadV1=Readonly<{
  protocol:'myeongha.cancel.ops.identity-assertion.v1';
  environment:'sandbox';
  audience:'myeongha.cancel.ops.offline-verifier.v1';
  idpKeyId:string;
  orgSubjectId:string;
  principalId:string;
  role:PrivateCancelReviewRoleV1;
  signingKeyId:string;
  inboxId:string;
  action:PrivateCancelReviewActionV1;
  ticketReference:string;
  challengeId:string;
  authMethod:'phishing_resistant_mfa';
  authenticatedAt:string;
  issuedAt:string;
  expiresAt:string;
}>;
export type PrivateCancelIdentityAssertionV1=Readonly<{
  payload:PrivateCancelIdentityAssertionPayloadV1;
  signatureBase64:string;
}>;
export type PrivateCancelIdentitySubjectV1=Readonly<{
  principalId:string;
  signingKeyId:string;
  role:PrivateCancelReviewRoleV1;
  status:'active'|'disabled';
}>;
export type PrivateCancelIdentityDirectoryV1=
  Readonly<Record<string,PrivateCancelIdentitySubjectV1|undefined>>;
export type PrivateCancelIdpTrustV1=
  Readonly<Record<string,Readonly<{publicKeyPem:string;enabled:boolean}>|undefined>>;

const PROTOCOL='myeongha.cancel.ops.identity-assertion.v1' as const;
const AUDIENCE='myeongha.cancel.ops.offline-verifier.v1' as const;
const SUBJECT=/^org_[a-z0-9_]{6,32}$/u;
const PRINCIPAL=/^op_[a-z0-9_]{6,32}$/u;
const OP_KEY=/^key_[a-z0-9_]{6,32}$/u;
const IDP=/^idp_[a-z0-9_]{6,32}$/u;
const B64=/^[A-Za-z0-9+/]{86}==$/u;
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TICKET=/^OPS-[0-9]{4,12}$/u;
const PAYLOAD_FIELDS=[
  'action','audience','authMethod','authenticatedAt','challengeId',
  'environment','expiresAt','idpKeyId','inboxId','issuedAt','orgSubjectId',
  'principalId','protocol','role','signingKeyId','ticketReference',
];
function exactObject(value:unknown,fields:readonly string[]):value is Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
}
function utc(value:unknown):value is string{
  return typeof value==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString()===value;
}
function trustObject(value:unknown):value is Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value);
}
/** Deterministic 16-field serialization. No PEM or PII free-text in payload. */
export function canonicalPrivateCancelIdentityAssertionV1(
  p:PrivateCancelIdentityAssertionPayloadV1,
):Uint8Array{
  return Buffer.from(JSON.stringify({
    protocol:p.protocol,environment:p.environment,audience:p.audience,
    idpKeyId:p.idpKeyId,orgSubjectId:p.orgSubjectId,
    principalId:p.principalId,role:p.role,signingKeyId:p.signingKeyId,
    inboxId:p.inboxId,action:p.action,ticketReference:p.ticketReference,
    challengeId:p.challengeId,authMethod:p.authMethod,
    authenticatedAt:p.authenticatedAt,issuedAt:p.issuedAt,expiresAt:p.expiresAt,
  }),'utf8');
}

function verifyOne(input:Readonly<{
  assertion:unknown;
  expectedRole:PrivateCancelReviewRoleV1;
  command:PrivateCancelVerifiedReviewCommandV1;
  directory:PrivateCancelIdentityDirectoryV1;
  idpKeys:PrivateCancelIdpTrustV1;
  now:Date;
}>):string{
  if (!exactObject(input.assertion,['payload','signatureBase64'])
    || !exactObject(input.assertion.payload,PAYLOAD_FIELDS)
    || typeof input.assertion.signatureBase64!=='string'
    || !B64.test(input.assertion.signatureBase64)) {
    throw new Error('Private cancel identity assertion has invalid shape.');
  }
  const p=input.assertion.payload;
  if(p.protocol!==PROTOCOL || p.environment!=='sandbox'
    || p.audience!==AUDIENCE || p.authMethod!=='phishing_resistant_mfa'
    || typeof p.idpKeyId!=='string' || !IDP.test(p.idpKeyId)
    || typeof p.orgSubjectId!=='string' || !SUBJECT.test(p.orgSubjectId)
    || typeof p.principalId!=='string' || !PRINCIPAL.test(p.principalId)
    || typeof p.signingKeyId!=='string' || !OP_KEY.test(p.signingKeyId)
    || p.role!==input.expectedRole
    || typeof p.inboxId!=='string' || !UID.test(p.inboxId)
    || typeof p.challengeId!=='string' || !UID.test(p.challengeId)
    || typeof p.ticketReference!=='string' || !TICKET.test(p.ticketReference)
    || (p.action!=='acknowledge' && p.action!=='retry_transient')
    || !utc(p.authenticatedAt) || !utc(p.issuedAt) || !utc(p.expiresAt)) {
    throw new Error('Private cancel identity assurance/scope is invalid.');
  }
  const cmd=input.command;
  const needed=input.expectedRole==='requester'?
    {principalId:cmd.requesterPrincipalId,keyId:cmd.requesterKeyId}:
    {principalId:cmd.approverPrincipalId,keyId:cmd.approverKeyId};
  if (p.principalId!==needed.principalId || p.signingKeyId!==needed.keyId
    || p.inboxId!==cmd.inboxId || p.action!==cmd.action
    || p.ticketReference!==cmd.ticketReference
    || p.challengeId!==cmd.challengeId) {
    throw new Error('Private cancel identity assertion does not bind to exact review.');
  }
  const now=input.now.valueOf(),auth=Date.parse(p.authenticatedAt);
  const issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
  if (!Number.isFinite(now)
    || auth>issued || auth>now+30_000 || auth<now-300_000
    || issued>now+30_000 || issued<now-300_000
    || issued<Date.parse(cmd.issuedAt)
    || expires<=now || expires<=issued || expires-issued>300_000
    || expires>Date.parse(cmd.expiresAt)) {
    throw new Error('Private cancel identity authentication/assertion is stale.');
  }
  const known=input.directory[p.orgSubjectId];
  if (!known || known.status!=='active'
    || known.principalId!==p.principalId
    || known.role!==input.expectedRole
    || known.signingKeyId!==p.signingKeyId) {
    throw new Error('Private cancel identity operator is disabled or not assigned.');
  }
  const idp=input.idpKeys[p.idpKeyId];
  if(!idp || idp.enabled!==true || typeof idp.publicKeyPem!=='string'
    || idp.publicKeyPem.length>4096) {
    throw new Error('Private cancel identity issuer is not pinned and active.');
  }
  const raw=Buffer.from(input.assertion.signatureBase64,'base64');
  if(raw.length!==64 || raw.toString('base64')!==input.assertion.signatureBase64){
    throw new Error('Private cancel identity issuer signature is not canonical.');
  }
  try {
    const pub=createPublicKey(idp.publicKeyPem);
    if(pub.asymmetricKeyType!=='ed25519' || pub.type!=='public'
      || !edVerify(null,canonicalPrivateCancelIdentityAssertionV1(
        p as PrivateCancelIdentityAssertionPayloadV1),pub,raw)) {
      throw new Error('invalid signature');
    }
  }catch{
    throw new Error('Private cancel identity issuer signature verification failed.');
  }
  return p.orgSubjectId;
}

export function verifyOfflinePrivateCancelIdentityPairV1(input:Readonly<{
  statement:unknown;
  operatorAttestations:readonly unknown[];
  identityAssertions:readonly unknown[];
  trustedOperatorKeys:Readonly<Record<string,PrivateCancelReviewTrustedKeyV1|undefined>>;
  pinnedIdpKeys:PrivateCancelIdpTrustV1;
  trustedIdentityDirectory:PrivateCancelIdentityDirectoryV1;
  now:Date;
}>):PrivateCancelVerifiedReviewCommandV1{
  if(!(input.now instanceof Date) || !Number.isFinite(input.now.valueOf())
    || !Array.isArray(input.identityAssertions) || input.identityAssertions.length!==2
    || !trustObject(input.pinnedIdpKeys)
    || !trustObject(input.trustedIdentityDirectory)) {
    throw new Error('Private cancel identity preflight requires two trusted assertions.');
  }
  // First, verify the original human operator signatures through D3e8.
  // This prevents an IdP assertion alone from manufacturing an operator proof.
  const command=verifyPrivateCancelDualSignaturesV1({
    statement:input.statement,attestations:input.operatorAttestations,
    trustedKeys:input.trustedOperatorKeys,now:input.now,
  });
  const requester=verifyOne({
    assertion:input.identityAssertions[0],expectedRole:'requester',
    command,directory:input.trustedIdentityDirectory,
    idpKeys:input.pinnedIdpKeys,now:input.now,
  });
  const approver=verifyOne({
    assertion:input.identityAssertions[1],expectedRole:'approver',
    command,directory:input.trustedIdentityDirectory,
    idpKeys:input.pinnedIdpKeys,now:input.now,
  });
  if(requester===approver){
    throw new Error('Private cancel identity requires two distinct organizational subjects.');
  }
  return command;
}

/** Test-only end-to-end identity gate. No new HTTP or DB execution rights. */
export function issueIdentityBoundSandboxPrivateCancelPermitV1(input:Readonly<{
  statement:unknown;
  operatorAttestations:readonly unknown[];
  identityAssertions:readonly unknown[];
  trustedOperatorKeys:Readonly<Record<string,PrivateCancelReviewTrustedKeyV1|undefined>>;
  pinnedIdpKeys:PrivateCancelIdpTrustV1;
  trustedIdentityDirectory:PrivateCancelIdentityDirectoryV1;
  issuerKeyId:string;
  issuerPrivateKeyPem:string;
  now:Date;
}>):PrivateCancelDetachedPermitV1{
  verifyOfflinePrivateCancelIdentityPairV1(input);
  return issueSandboxPrivateCancelReviewPermitV1({
    statement:input.statement,
    attestations:input.operatorAttestations,
    trustedOperatorKeys:input.trustedOperatorKeys,
    issuerKeyId:input.issuerKeyId,
    issuerPrivateKeyPem:input.issuerPrivateKeyPem,
    now:input.now,
  });
}
