/**
 * D3e10 OFFLINE ONLY: detached verifier -> signed permit -> executor simulation.
 *
 * Verifier: verifies two independent D3e8 operator Ed25519 signatures and
 * signs a short-lived, sandbox-scoped execution permit with a DISTINCT
 * verifier-service Ed25519 private key (explicit injected dependency).
 *
 * Executor: holds only a PINNED issuer public-key registry and an injected
 * offline DB-owner test store. It verifies the permit BEFORE any SQL access.
 *
 * Never mount on an HTTP route, introduce shared verifier/executor credentials,
 * accept caller-supplied signing keys as trusted, or deploy a SECURITY DEFINER
 * facade. DB owner and legacy D3e6 remain bypass paths. No live authorization.
 */
import {
  createPrivateKey,createPublicKey,
  sign as edSign,verify as edVerify,
} from 'node:crypto';
import {
  verifyPrivateCancelDualSignaturesV1,
  validatePrivateCancelReviewReceiptV1,
  type PrivateCancelReviewAuthorizedStoreV1,
  type PrivateCancelReviewAuthorizedResultV1,
  type PrivateCancelReviewTrustedKeyV1,
  type PrivateCancelReviewStatementV1,
  type PrivateCancelVerifiedReviewCommandV1,
} from './official-reader-portone-cancel-private-dual-approval-v1.js';

export type PrivateCancelDetachedPermitV1 = Readonly<{
  payload: Readonly<{
    protocol: 'myeongha.cancel.ops.detached-permit.v1';
    environment: 'sandbox';
    issuerKeyId: string;
    permitIssuedAt: string;
    permitExpiresAt: string;
    command: PrivateCancelVerifiedReviewCommandV1;
  }>;
  signatureBase64: string;
}>;
export type PrivateCancelPermitIssuerRegistryV1 = Readonly<
  Record<string, Readonly<{ publicKeyPem: string; enabled: true }> | undefined>
>;

const PROTOCOL='myeongha.cancel.ops.detached-permit.v1' as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY=/^key_[a-z0-9_]{6,32}$/u;
const PERSON=/^op_[a-z0-9_]{6,32}$/u;
const ISSUER=/^issuer_[a-z0-9_]{6,32}$/u;
const TICKET=/^OPS-[0-9]{4,12}$/u;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;
const SIG=/^[A-Za-z0-9+/]{86}==$/u;
const COMMAND_FIELDS=[
  'action','approverKeyId','approverPrincipalId','challengeId','expiresAt',
  'inboxId','issuedAt','requesterKeyId','requesterPrincipalId',
  'statementDigest','ticketReference',
];
const PAYLOAD_FIELDS=[
  'command','environment','issuerKeyId','permitExpiresAt','permitIssuedAt','protocol',
];
function isShape(input:unknown,fields:readonly string[]):input is Record<string,unknown> {
  return input!==null && typeof input==='object' && !Array.isArray(input)
    && JSON.stringify(Object.keys(input).sort())===JSON.stringify([...fields].sort());
}
function iso(input:unknown):input is string {
  return typeof input==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input)
    && Number.isFinite(Date.parse(input))
    && new Date(Date.parse(input)).toISOString()===input;
}
function validCommand(value:unknown,now:Date):PrivateCancelVerifiedReviewCommandV1 {
  if (!isShape(value,COMMAND_FIELDS)
    || typeof value.inboxId!=='string' || !UUID.test(value.inboxId)
    || typeof value.challengeId!=='string' || !UUID.test(value.challengeId)
    || typeof value.ticketReference!=='string' || !TICKET.test(value.ticketReference)
    || (value.action!=='acknowledge' && value.action!=='retry_transient')
    || typeof value.requesterKeyId!=='string' || !KEY.test(value.requesterKeyId)
    || typeof value.approverKeyId!=='string' || !KEY.test(value.approverKeyId)
    || value.requesterKeyId===value.approverKeyId
    || typeof value.requesterPrincipalId!=='string'
    || !PERSON.test(value.requesterPrincipalId)
    || typeof value.approverPrincipalId!=='string'
    || !PERSON.test(value.approverPrincipalId)
    || value.requesterPrincipalId===value.approverPrincipalId
    || typeof value.statementDigest!=='string' || !DIGEST.test(value.statementDigest)
    || !iso(value.issuedAt) || !iso(value.expiresAt)) {
    throw new Error('Private detached permit contains invalid operator approval facts.');
  }
  const start=Date.parse(value.issuedAt),end=Date.parse(value.expiresAt);
  const clock=now.valueOf();
  if (start>clock+30_000 || start<clock-600_000
    || end<=clock || end<=start || end-start>600_000) {
    throw new Error('Private detached permit contains an expired or future-dated approval.');
  }
  return Object.freeze({
    inboxId:value.inboxId,action:value.action,
    ticketReference:value.ticketReference,challengeId:value.challengeId,
    issuedAt:value.issuedAt,expiresAt:value.expiresAt,
    requesterKeyId:value.requesterKeyId,approverKeyId:value.approverKeyId,
    requesterPrincipalId:value.requesterPrincipalId,
    approverPrincipalId:value.approverPrincipalId,
    statementDigest:value.statementDigest,
  });
}
function validatedPayload(input:unknown,now:Date):PrivateCancelDetachedPermitV1['payload'] {
  if (!isShape(input,PAYLOAD_FIELDS)
    || input.protocol!==PROTOCOL || input.environment!=='sandbox'
    || typeof input.issuerKeyId!=='string' || !ISSUER.test(input.issuerKeyId)
    || !iso(input.permitIssuedAt) || !iso(input.permitExpiresAt)
    || !Number.isFinite(now.valueOf())) {
    throw new Error('Private detached permit has an invalid sandbox payload.');
  }
  const issued=Date.parse(input.permitIssuedAt),expires=Date.parse(input.permitExpiresAt);
  if (issued>now.valueOf()+10_000 || issued<now.valueOf()-60_000
    || expires<=now.valueOf() || expires<=issued || expires-issued>60_000) {
    throw new Error('Private detached permit has expired or unsafe short-lived timing.');
  }
  const command=validCommand(input.command,now);
  if (issued<Date.parse(command.issuedAt) || expires>Date.parse(command.expiresAt)) {
    throw new Error('Private detached permit extends or precedes the signed operator claim.');
  }
  return Object.freeze({
    protocol:PROTOCOL,environment:'sandbox',
    issuerKeyId:input.issuerKeyId,
    permitIssuedAt:input.permitIssuedAt,
    permitExpiresAt:input.permitExpiresAt,
    command,
  });
}
/** Explicit deterministic protocol serialization; all fields are authenticated. */
export function canonicalPrivateCancelDetachedPermitV1(
  payload:PrivateCancelDetachedPermitV1['payload'],
):Uint8Array {
  const c=payload.command;
  return Buffer.from(JSON.stringify({
    protocol:payload.protocol,environment:payload.environment,
    issuerKeyId:payload.issuerKeyId,
    permitIssuedAt:payload.permitIssuedAt,permitExpiresAt:payload.permitExpiresAt,
    command:{
      inboxId:c.inboxId,action:c.action,ticketReference:c.ticketReference,
      challengeId:c.challengeId,issuedAt:c.issuedAt,expiresAt:c.expiresAt,
      requesterKeyId:c.requesterKeyId,approverKeyId:c.approverKeyId,
      requesterPrincipalId:c.requesterPrincipalId,
      approverPrincipalId:c.approverPrincipalId,
      statementDigest:c.statementDigest,
    },
  }),'utf8');
}

/**
 * Called ONLY inside a detached, independently authenticated offline verifier.
 * Signing private key belongs to that verifier ONLY, never the executor.
 */
export function issueSandboxPrivateCancelReviewPermitV1(input:Readonly<{
  statement:unknown;
  attestations:readonly unknown[];
  trustedOperatorKeys:Readonly<
    Record<string,PrivateCancelReviewTrustedKeyV1|undefined>>;
  issuerKeyId:string;
  issuerPrivateKeyPem:string;
  now:Date;
}>):PrivateCancelDetachedPermitV1 {
  if (!Number.isFinite(input.now?.valueOf())
    || typeof input.issuerKeyId!=='string' || !ISSUER.test(input.issuerKeyId)
    || typeof input.issuerPrivateKeyPem!=='string'
    || input.issuerPrivateKeyPem.length>4096) {
    throw new Error('Private detached permit issuer dependencies are invalid.');
  }
  // No SQL is touched here: the first boundary verifies BOTH operator proofs.
  const command=verifyPrivateCancelDualSignaturesV1({
    statement:input.statement as PrivateCancelReviewStatementV1,
    attestations:input.attestations,
    trustedKeys:input.trustedOperatorKeys,
    now:input.now,
  });
  const expiry=Math.min(input.now.valueOf()+60_000,Date.parse(command.expiresAt));
  const payload:PrivateCancelDetachedPermitV1['payload']=Object.freeze({
    protocol:PROTOCOL,environment:'sandbox',
    issuerKeyId:input.issuerKeyId,
    permitIssuedAt:input.now.toISOString(),
    permitExpiresAt:new Date(expiry).toISOString(),
    command,
  });
  // This validates all timing/protocol edges BEFORE signing.
  const checked=validatedPayload(payload,input.now);
  let signature:Buffer;
  try {
    const privateKey=createPrivateKey(input.issuerPrivateKeyPem);
    if (privateKey.asymmetricKeyType!=='ed25519' || privateKey.type!=='private') {
      throw new Error('not an Ed25519 issuer key');
    }
    signature=edSign(null,canonicalPrivateCancelDetachedPermitV1(checked),privateKey);
  } catch {
    throw new Error('Private detached permit requires a trusted Ed25519 verifier signer.');
  }
  return Object.freeze({
    payload:checked,
    signatureBase64:signature.toString('base64'),
  });
}

/**
 * Executor requires only the trusted verifier PUBLIC key, not human signatures
 * or verifier private key. DB is called only after full permit verification.
 */
export async function executeSandboxPrivateCancelReviewPermitV1(input:Readonly<{
  permit:unknown;
  trustedIssuers:PrivateCancelPermitIssuerRegistryV1;
  now:Date;
  store:PrivateCancelReviewAuthorizedStoreV1;
}>):Promise<PrivateCancelReviewAuthorizedResultV1> {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.valueOf())
    || typeof input.store?.commitAuthorizedReview!=='function'
    || input.trustedIssuers===null || typeof input.trustedIssuers!=='object'
    || Array.isArray(input.trustedIssuers)) {
    throw new Error('Private detached permit executor dependencies are invalid.');
  }
  if (!isShape(input.permit,['payload','signatureBase64'])
    || typeof input.permit.signatureBase64!=='string'
    || !SIG.test(input.permit.signatureBase64)) {
    throw new Error('Private detached permit envelope or encoding invalid.');
  }
  const payload=validatedPayload(input.permit.payload,input.now);
  const issuer=input.trustedIssuers[payload.issuerKeyId];
  if (!issuer || issuer.enabled!==true
    || typeof issuer.publicKeyPem!=='string'
    || issuer.publicKeyPem.length>4096) {
    throw new Error('Private detached permit issuer is not pinned or active.');
  }
  const signature=Buffer.from(input.permit.signatureBase64,'base64');
  if (signature.length!==64
    || signature.toString('base64')!==input.permit.signatureBase64) {
    throw new Error('Private detached permit signature is not canonical Ed25519.');
  }
  try {
    const key=createPublicKey(issuer.publicKeyPem);
    if (key.asymmetricKeyType!=='ed25519' || key.type!=='public'
      || !edVerify(null,canonicalPrivateCancelDetachedPermitV1(payload),key,signature)) {
      throw new Error('invalid verifier signature');
    }
  } catch {
    throw new Error('Private detached permit verifier signature was rejected.');
  }
  // SQL 1950 must commit review + receipt atomically; its UNIQUE challenge_id
  // is the ONLY durable anti-replay barrier. TS does not claim exactly once.
  const response=await input.store.commitAuthorizedReview(payload.command);
  return validatePrivateCancelReviewReceiptV1(payload.command,response);
}
