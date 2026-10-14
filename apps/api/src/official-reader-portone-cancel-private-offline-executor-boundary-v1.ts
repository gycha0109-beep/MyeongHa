/**
 * D3e14 OFFLINE candidate, executor-side ONLY.
 *
 * This module imports NO private signing key, IdP verifier, identity directory,
 * operator attestation signer or sensitive credential.
 *
 * A SQL test-store capability is attached only at trusted boot, never supplied
 * in a request. The independently root-verified policy pins issuer public
 * keys and rollback floor. No production DB role, connection or writer created.
 *
 * This is an in-process facade prototype, NOT real OS/DB process isolation.
 * D3e6/D3e8 owner bypass remains. HOLD.
 */
import {
  executeSandboxPrivateCancelReviewPermitV1,
  type PrivateCancelDetachedPermitV1,
} from './official-reader-portone-cancel-detached-permit-private-v1.js';
import type {
  PrivateCancelReviewAuthorizedStoreV1,
  PrivateCancelReviewAuthorizedResultV1,
} from './official-reader-portone-cancel-private-dual-approval-v1.js';
import {
  verifyOfflinePrivateCancelSignedTrustPolicyV1,
  type PrivateCancelSignedTrustPolicyV1,
  type PrivateCancelTrustedRootV1,
} from './official-reader-portone-cancel-private-signed-trust-policy-v1.js';

export type PrivateCancelOfflineExecutorBoundaryV1=Readonly<{
  execute(input:unknown):Promise<PrivateCancelReviewAuthorizedResultV1>;
}>;

function permitRequestShape(input:unknown):input is Readonly<{
  permit:PrivateCancelDetachedPermitV1;
}>{
  return input!==null && typeof input==='object' && !Array.isArray(input)
    && JSON.stringify(Object.keys(input))===JSON.stringify(['permit']);
}

/**
 * Store is a TEST fixture capability, not production SQL authority.
 * This module cannot issue permits, construct signers or trust caller keys.
 */
export function createOfflinePrivateCancelExecutorBoundaryV1(input:Readonly<{
  signedPolicy:PrivateCancelSignedTrustPolicyV1;
  pinnedRoot:PrivateCancelTrustedRootV1;
  testStore:PrivateCancelReviewAuthorizedStoreV1;
  trustedClock:()=>Date;
}>):PrivateCancelOfflineExecutorBoundaryV1{
  if(typeof input.trustedClock!=='function'
    || typeof input.testStore?.commitAuthorizedReview!=='function'){
    throw new Error('Offline cancellation executor requires trusted boot dependencies.');
  }
  // Only signed issuer PUBLIC keys and policy expiry survive in the
  // executor closure: never retain IdP/organization directory or root input.
  const bootPolicy=verifyOfflinePrivateCancelSignedTrustPolicyV1({
    envelope:input.signedPolicy,pinnedRoot:input.pinnedRoot,
    now:input.trustedClock(),
  });
  const trustedIssuers=bootPolicy.trustedPermitIssuers;
  const expiresAt=Date.parse(bootPolicy.expiresAt);
  const clock=input.trustedClock,store=input.testStore;
  return Object.freeze({
    async execute(request:unknown):Promise<PrivateCancelReviewAuthorizedResultV1>{
      if(!permitRequestShape(request)){
        throw new Error('Offline cancellation executor refuses caller-supplied credentials and store.');
      }
      // The root was verified at startup. Reject expired snapshots at each
      // use; a newly revoked signer requires a new trusted bootstrap.
      const now=clock();
      if(!(now instanceof Date)||!Number.isFinite(now.valueOf())
        || now.valueOf()>=expiresAt){
        throw new Error('Offline cancellation signed policy expired or clock invalid.');
      }
      return executeSandboxPrivateCancelReviewPermitV1({
        permit:request.permit,
        trustedIssuers,
        now,
        store,
      });
    },
  });
}
