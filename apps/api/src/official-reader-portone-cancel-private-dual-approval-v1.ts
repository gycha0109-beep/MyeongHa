/**
 * D3e8 SANDBOX-ONLY, explicitly invoked, dual-signature review preflight.
 *
 * Independent Ed25519 signatures from two distinct trusted principals are
 * verified against an injected, pre-provisioned key registry. NO user-supplied
 * signing key can become trusted by being included in an approval message.
 *
 * The DB-owner-only test store atomically calls 1950 -> D3e6 and prevents
 * challenge replay. NO runtime/HTTP route, operator login, signing service,
 * scheduler, production DB GRANT, live PortOne, refund or rights mutation.
 *
 * SECURITY BOUNDARY: This does not prove a human identity. Registry key
 * custody, separation of duties and disabling the older owner-only D3e6
 * direct path are NOT implemented. Remains HOLD.
 */
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';

export type PrivateCancelReviewActionV1 = 'acknowledge' | 'retry_transient';
export type PrivateCancelReviewRoleV1 = 'requester' | 'approver';

export type PrivateCancelReviewStatementV1 = Readonly<{
  protocol: 'myeongha.cancel.ops.review.ed25519.v1';
  environment: 'sandbox';
  inboxId: string;
  action: PrivateCancelReviewActionV1;
  ticketReference: string;
  challengeId: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type PrivateCancelReviewSignatureV1 = Readonly<{
  keyId: string;
  signatureBase64: string;
}>;

export type PrivateCancelReviewTrustedKeyV1 = Readonly<{
  role: PrivateCancelReviewRoleV1;
  principalId: string;
  publicKeyPem: string;
  enabled: true;
}>;

export type PrivateCancelReviewTrustRegistryV1 =
  Readonly<Record<string, PrivateCancelReviewTrustedKeyV1 | undefined>>;

export interface PrivateCancelReviewAuthorizedStoreV1 {
  /** Must be ONE atomic SQL statement/transaction: 1950 receipt and D3e6 review. */
  commitAuthorizedReview(data: Readonly<{
    inboxId: string;
    action: PrivateCancelReviewActionV1;
    ticketReference: string;
    challengeId: string;
    issuedAt: string;
    expiresAt: string;
    requesterKeyId: string;
    approverKeyId: string;
    requesterPrincipalId: string;
    approverPrincipalId: string;
    statementDigest: string;
  }>): Promise<unknown>;
}

export type PrivateCancelReviewAuthorizedResultV1 = Readonly<{
  reviewState: 'held' | 'dead_letter' | 'queued';
  approvalRecorded: true;
  effectAuthorized: false;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

const PROTOCOL='myeongha.cancel.ops.review.ed25519.v1' as const;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TICKET=/^OPS-[0-9]{4,12}$/u;
const KEY=/^key_[a-z0-9_]{6,32}$/u;
const PERSON=/^op_[a-z0-9_]{6,32}$/u;
const B64=/^[A-Za-z0-9+/]{86}==$/u;
const EXPECTED_STATEMENT_KEYS=Object.freeze([
  'action','challengeId','environment','expiresAt',
  'inboxId','issuedAt','protocol','ticketReference',
]);
const EXPECTED_SIGNATURE_KEYS=Object.freeze(['keyId','signatureBase64']);

function exactObject(x: unknown, keys: readonly string[]): x is Record<string, unknown> {
  return x!==null && typeof x==='object' && !Array.isArray(x)
    && JSON.stringify(Object.keys(x).sort())===JSON.stringify(keys);
}
function exactUtcMilliseconds(x: unknown): x is string {
  return typeof x==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(x)
    && Number.isFinite(Date.parse(x))
    && new Date(Date.parse(x)).toISOString()===x;
}
function approvedStatement(
  value: unknown, now: Date,
): PrivateCancelReviewStatementV1 {
  if (!exactObject(value,EXPECTED_STATEMENT_KEYS)) {
    throw new Error('Private cancellation approval statement shape invalid.');
  }
  const x=value;
  if (x.protocol!==PROTOCOL || x.environment!=='sandbox'
    || typeof x.inboxId!=='string' || !UUID.test(x.inboxId)
    || (x.action!=='acknowledge' && x.action!=='retry_transient')
    || typeof x.ticketReference!=='string' || !TICKET.test(x.ticketReference)
    || typeof x.challengeId!=='string' || !UUID.test(x.challengeId)
    || !exactUtcMilliseconds(x.issuedAt)
    || !exactUtcMilliseconds(x.expiresAt)
    || !Number.isFinite(now.valueOf())) {
    throw new Error('Private cancellation approval claim invalid or not sandbox-only.');
  }
  const start=Date.parse(x.issuedAt),end=Date.parse(x.expiresAt),current=now.getTime();
  if (start>current+30_000 || start<current-600_000
    || end<=current || end<=start || end-start>600_000) {
    throw new Error('Private cancellation approval expired, future-dated or overlong.');
  }
  return Object.freeze({
    protocol:PROTOCOL,environment:'sandbox',
    inboxId:x.inboxId,action:x.action,ticketReference:x.ticketReference,
    challengeId:x.challengeId,issuedAt:x.issuedAt,expiresAt:x.expiresAt,
  });
}

/** Exported only so isolated test-signers can sign the identical wire format. */
export function canonicalPrivateCancelReviewStatementV1(
  statement: PrivateCancelReviewStatementV1,
): Uint8Array {
  // Fixed insertion order; all eight fields are signed. No user free text.
  return Buffer.from(JSON.stringify({
    protocol:statement.protocol,
    environment:statement.environment,
    inboxId:statement.inboxId,
    action:statement.action,
    ticketReference:statement.ticketReference,
    challengeId:statement.challengeId,
    issuedAt:statement.issuedAt,
    expiresAt:statement.expiresAt,
  }),'utf8');
}

function signature(
  submitted: unknown, expectedRole: PrivateCancelReviewRoleV1,
  statementBytes: Uint8Array, registry: PrivateCancelReviewTrustRegistryV1,
): Readonly<{ keyId: string; principalId: string; signatureBytes: Buffer }> {
  if (!exactObject(submitted,EXPECTED_SIGNATURE_KEYS)
    || typeof submitted.keyId!=='string' || !KEY.test(submitted.keyId)
    || typeof submitted.signatureBase64!=='string'
    || !B64.test(submitted.signatureBase64)) {
    throw new Error('Private cancellation signature envelope invalid.');
  }
  const key=registry[submitted.keyId];
  if (!key || key.enabled!==true || key.role!==expectedRole
    || !PERSON.test(key.principalId)
    || typeof key.publicKeyPem!=='string'
    || key.publicKeyPem.length>4096) {
    throw new Error('Private cancellation signer is not independently trusted.');
  }
  const raw=Buffer.from(submitted.signatureBase64,'base64');
  if (raw.length!==64 || raw.toString('base64')!==submitted.signatureBase64) {
    throw new Error('Private cancellation signature encoding invalid.');
  }
  try {
    const pub=createPublicKey(key.publicKeyPem);
    if (pub.asymmetricKeyType!=='ed25519' || pub.type!=='public'
      || !edVerify(null,statementBytes,pub,raw)) {
      throw new Error('invalid signature');
    }
  } catch {
    throw new Error('Private cancellation approval signature verification failed.');
  }
  return Object.freeze({
    keyId:submitted.keyId,principalId:key.principalId,signatureBytes:raw,
  });
}

/**
 * Full check occurs BEFORE the store is called. The store MUST be a sandbox
 * DB-owner-only adapter to 1950 with a durable uniqueness fence. A privileged
 * caller can still bypass this TS shim by using D3e6 directly: not production.
 */
export async function commitPrivateCancelDualApprovedReviewV1(input: Readonly<{
  statement: unknown;
  attestations: readonly unknown[];
  trustedKeys: PrivateCancelReviewTrustRegistryV1;
  now: Date;
  store: PrivateCancelReviewAuthorizedStoreV1;
}>): Promise<PrivateCancelReviewAuthorizedResultV1> {
  if (typeof input.store?.commitAuthorizedReview!=='function'
    || input.trustedKeys===null || typeof input.trustedKeys!=='object'
    || Array.isArray(input.trustedKeys)
    || !(input.now instanceof Date)) {
    throw new Error('Private cancellation approval requires explicit trusted dependencies.');
  }
  const statement=approvedStatement(input.statement,input.now);
  if (!Array.isArray(input.attestations) || input.attestations.length!==2) {
    throw new Error('Private cancellation approval requires exactly two signatures.');
  }
  const bytes=canonicalPrivateCancelReviewStatementV1(statement);
  const requester=signature(input.attestations[0],'requester',bytes,input.trustedKeys);
  const approver=signature(input.attestations[1],'approver',bytes,input.trustedKeys);
  if (requester.keyId===approver.keyId
    || requester.principalId===approver.principalId) {
    throw new Error('Private cancellation approval requires two distinct trusted principals.');
  }
  // Do not persist raw signatures. This is a checksum, NOT proof of a human identity.
  const digest='sha256:'+createHash('sha256')
    .update('myeongha-private-cancel-review-proof-v1\0')
    .update(bytes)
    .update('\0'+requester.keyId+'\0')
    .update(requester.signatureBytes)
    .update('\0'+approver.keyId+'\0')
    .update(approver.signatureBytes)
    .digest('hex');

  const response=await input.store.commitAuthorizedReview(Object.freeze({
    inboxId:statement.inboxId,
    action:statement.action,
    ticketReference:statement.ticketReference,
    challengeId:statement.challengeId,
    issuedAt:statement.issuedAt,
    expiresAt:statement.expiresAt,
    requesterKeyId:requester.keyId,
    approverKeyId:approver.keyId,
    requesterPrincipalId:requester.principalId,
    approverPrincipalId:approver.principalId,
    statementDigest:digest,
  }));

  if (response===null || typeof response!=='object' || Array.isArray(response)) {
    throw new Error('Private cancellation approval DB response is invalid.');
  }
  const row=response as Record<string,unknown>;
  if (row.effectAuthorized!==false
    || typeof row.authorizationReceiptId!=='string'
    || !UUID.test(row.authorizationReceiptId)
    || (statement.action==='retry_transient' && row.reviewState!=='queued')
    || (statement.action==='acknowledge'
      && row.reviewState!=='held' && row.reviewState!=='dead_letter')) {
    throw new Error('Private cancellation approval receipt does not confirm atomic review.');
  }
  return Object.freeze({
    reviewState:row.reviewState as 'held'|'dead_letter'|'queued',
    approvalRecorded:true,
    effectAuthorized:false,providerRefundAuthorized:false,
    entitlementMutationAuthorized:false,
  });
}
