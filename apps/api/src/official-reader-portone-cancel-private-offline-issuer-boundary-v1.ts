/**
 * D3e14 OFFLINE candidate, verifier-side ONLY.
 *
 * Boot root/identity policy/issuer private key are trusted-process startup
 * dependencies. Every request has ONLY operator proofs + signed IdP assertions:
 * it cannot override trust roots, org assignments, signing key, DB executor,
 * current time, or the policy rollback floor.
 *
 * Not a service boundary: constructing this facade with attacker-owned root
 * or issuer key is still possible in a shared JS process. Production requires
 * independently managed secret custody, immutable trusted bootstrap and IdP.
 */
import {createPrivateKey,createPublicKey,sign as edSign} from 'node:crypto';
import {
  issueIdentityBoundSandboxPrivateCancelPermitV1,
} from './official-reader-portone-cancel-private-identity-attestation-v1.js';
import {
  verifyOfflinePrivateCancelSignedTrustPolicyV1,
  type PrivateCancelSignedTrustPolicyV1,
  type PrivateCancelTrustedRootV1,
} from './official-reader-portone-cancel-private-signed-trust-policy-v1.js';
import {
  buildPrivateCancelPermitPolicyBindingV1,
  canonicalPrivateCancelPermitPolicyBindingV1,
  type PrivateCancelPolicyBoundPermitV1,
  type PrivateCancelPolicyContextV1,
} from './official-reader-portone-cancel-private-policy-bound-permit-v1.js';

export type PrivateCancelOfflineIssuerBoundaryV1=Readonly<{
  issue(input:unknown):PrivateCancelPolicyBoundPermitV1;
}>;

function requestShape(input:unknown):input is Readonly<{
  statement:unknown;
  operatorAttestations:readonly unknown[];
  identityAssertions:readonly unknown[];
}>{
  return input!==null && typeof input==='object' && !Array.isArray(input)
    && JSON.stringify(Object.keys(input).sort())===JSON.stringify([
      'identityAssertions','operatorAttestations','statement',
    ]);
}
function keyBytes(pem:string):Buffer{
  return createPublicKey(pem).export({type:'spki',format:'der'}) as Buffer;
}

/** Separate OFFLINE verifier-only bootstrap; no SQL store or DB privileges. */
export function createOfflinePrivateCancelIssuerBoundaryV1(input:Readonly<{
  signedPolicy:PrivateCancelSignedTrustPolicyV1;
  pinnedRoot:PrivateCancelTrustedRootV1;
  issuerKeyId:string;
  issuerPrivateKeyPem:string;
  trustedClock:()=>Date;
}>):PrivateCancelOfflineIssuerBoundaryV1{
  if(typeof input.trustedClock!=='function'
    || typeof input.issuerKeyId!=='string'
    || typeof input.issuerPrivateKeyPem!=='string'
    || input.issuerPrivateKeyPem.length>4096){
    throw new Error('Offline cancellation issuer requires trusted boot dependencies.');
  }
  // Validate once at trusted bootstrap, retain only frozen, verified policy
  // facts; never retain the mutable caller-supplied envelope or trust root.
  const bootPolicy=verifyOfflinePrivateCancelSignedTrustPolicyV1({
    envelope:input.signedPolicy,pinnedRoot:input.pinnedRoot,
    now:input.trustedClock(),
  });
  const pinnedIssuer=bootPolicy.trustedPermitIssuers[input.issuerKeyId];
  if(!pinnedIssuer){
    throw new Error('Offline cancellation issuer key is not active in signed trust policy.');
  }
  try{
    const privateKey=createPrivateKey(input.issuerPrivateKeyPem);
    if(privateKey.asymmetricKeyType!=='ed25519'
      || !keyBytes(input.issuerPrivateKeyPem).equals(
        keyBytes(pinnedIssuer.publicKeyPem))){
      throw new Error('signing private key does not match policy public key');
    }
  }catch{
    throw new Error('Offline cancellation issuer private key mismatch.');
  }
  const issuerKeyId=input.issuerKeyId,issuerPrivateKeyPem=input.issuerPrivateKeyPem;
  const clock=input.trustedClock,policyExpiresAt=Date.parse(bootPolicy.expiresAt);
  const policyContext:PrivateCancelPolicyContextV1=Object.freeze({
    rootKeyId:bootPolicy.rootKeyId,
    policyId:bootPolicy.policyId,
    revision:bootPolicy.revision,
    policyDigest:bootPolicy.policyDigest,
  });
  return Object.freeze({
    issue(request:unknown):PrivateCancelPolicyBoundPermitV1{
      if(!requestShape(request)
        || !Array.isArray(request.operatorAttestations)
        || !Array.isArray(request.identityAssertions)){
        throw new Error('Offline cancellation issuer rejects caller-owned trust settings.');
      }
      // Root signature was verified at boot; frozen trusted facts cannot
      // change via caller mutation. Expiry is checked again per issuance.
      const now=clock();
      if(!(now instanceof Date)||!Number.isFinite(now.valueOf())
        || now.valueOf()>=policyExpiresAt){
        throw new Error('Offline cancellation signed policy expired or clock invalid.');
      }
      const inner=issueIdentityBoundSandboxPrivateCancelPermitV1({
        statement:request.statement,
        operatorAttestations:request.operatorAttestations,
        identityAssertions:request.identityAssertions,
        trustedOperatorKeys:bootPolicy.trustedOperatorKeys,
        pinnedIdpKeys:bootPolicy.pinnedIdpKeys,
        trustedIdentityDirectory:bootPolicy.trustedIdentityDirectory,
        issuerKeyId,
        issuerPrivateKeyPem,
        now,
      });
      // The separate outer Ed25519 proof authenticates exactly which
      // ROOT-SIGNED policy snapshot authorized this previously signed permit.
      // Merely changing the revision, root or policy hash invalidates the outer
      // proof. The executor independently checks BOTH signatures before SQL.
      const binding=buildPrivateCancelPermitPolicyBindingV1({
        policyContext,innerPermit:inner,now,
      });
      const proof=edSign(
        null,canonicalPrivateCancelPermitPolicyBindingV1(binding),
        createPrivateKey(issuerPrivateKeyPem),
      );
      return Object.freeze({
        ...inner,
        policyBinding:binding,
        policyBindingSignatureBase64:proof.toString('base64'),
      });
    },
  });
}
