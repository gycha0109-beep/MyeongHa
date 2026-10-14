/**
 * D3e13 TEST SUPPORT ONLY. This intentionally allows identity-unbound issuance
 * to exercise D3e10 permit-verification negative cases and historical vectors.
 *
 * Not part of apps/api/src. NEVER import into API runtime, HTTP route, worker,
 * or execution service. No production keys or persistent secrets.
 */
import {createPrivateKey,sign as edSign} from 'node:crypto';
import {
  verifyPrivateCancelDualSignaturesV1,
  type PrivateCancelReviewStatementV1,
  type PrivateCancelReviewTrustedKeyV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';
import {
  canonicalPrivateCancelDetachedPermitV1,
  validateSandboxPrivateCancelDetachedPayloadV1,
  type PrivateCancelDetachedPermitV1,
} from '../../apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.js';

/** Generates isolated adversarial test vectors; NOT a grantable issuer. */
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
    || typeof input.issuerKeyId!=='string'
    || !/^issuer_[a-z0-9_]{6,32}$/u.test(input.issuerKeyId)
    || typeof input.issuerPrivateKeyPem!=='string'
    || input.issuerPrivateKeyPem.length>4096) {
    throw new Error('Private detached permit test issuer dependencies are invalid.');
  }
  const command=verifyPrivateCancelDualSignaturesV1({
    statement:input.statement as PrivateCancelReviewStatementV1,
    attestations:input.attestations,
    trustedKeys:input.trustedOperatorKeys,
    now:input.now,
  });
  const expiry=Math.min(input.now.valueOf()+60_000,Date.parse(command.expiresAt));
  const payload:PrivateCancelDetachedPermitV1['payload']=Object.freeze({
    protocol:'myeongha.cancel.ops.detached-permit.v1',
    environment:'sandbox',issuerKeyId:input.issuerKeyId,
    permitIssuedAt:input.now.toISOString(),
    permitExpiresAt:new Date(expiry).toISOString(),command,
  });
  const checked=validateSandboxPrivateCancelDetachedPayloadV1(payload,input.now);
  let signature:Buffer;
  try {
    const issuer=createPrivateKey(input.issuerPrivateKeyPem);
    if (issuer.type!=='private' || issuer.asymmetricKeyType!=='ed25519') {
      throw new Error('issuer algorithm not Ed25519');
    }
    signature=edSign(null,canonicalPrivateCancelDetachedPermitV1(checked),issuer);
  } catch {
    throw new Error('Private detached permit requires a trusted Ed25519 verifier signer.');
  }
  return Object.freeze({payload:checked,signatureBase64:signature.toString('base64')});
}
