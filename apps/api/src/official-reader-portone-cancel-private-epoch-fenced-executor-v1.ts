/**
 * D3e16 OFFLINE execution fence: even a previously running executor must
 * consult an independently signed, FRESH, MONOTONIC current policy epoch
 * before every permit review, then AGAIN immediately before its test DB
 * store is invoked. A changed policy, HALT, rollback or epoch equivocation
 * irreversibly fences this instance until a fresh trusted bootstrap.
 *
 * No HTTP, production keys, background poller, new DB role or live refund.
 * Two checks are not an atomic DB revocation transaction: policy may
 * change AFTER the second check while the SQL store is committing.
 * Production requires a transaction-coupled current-epoch check in the
 * separately authorized database executor + operating-service isolation.
 */
import {
  executeSandboxPrivateCancelReviewPermitV1,
} from './official-reader-portone-cancel-detached-permit-private-v1.js';
import {
  verifyPrivateCancelPolicyBoundPermitV1,
  type PrivateCancelPolicyBoundPermitV1,
  type PrivateCancelPolicyContextV1,
} from './official-reader-portone-cancel-private-policy-bound-permit-v1.js';
import {
  verifyOfflinePrivateCancelSignedTrustPolicyV1,
  type PrivateCancelSignedTrustPolicyV1,
  type PrivateCancelTrustedRootV1,
} from './official-reader-portone-cancel-private-signed-trust-policy-v1.js';
import {
  assertPrivateCancelEpochSignerSeparateV1,
  verifyPrivateCancelSignedExecutionEpochV1,
  type PrivateCancelTrustedEpochSignerV1,
} from './official-reader-portone-cancel-private-execution-epoch-v1.js';
import type {
  PrivateCancelReviewAuthorizedResultV1,
  PrivateCancelReviewAuthorizedStoreV1,
} from './official-reader-portone-cancel-private-dual-approval-v1.js';
import type {
  PrivateCancelDurableEpochWatermarkPortV1,
} from './official-reader-portone-cancel-private-durable-epoch-watermark-v1.js';

export type PrivateCancelRevocationFencedExecutorV1=Readonly<{
  execute(input:unknown):Promise<PrivateCancelReviewAuthorizedResultV1>;
}>;

/**
 * readCurrentEpoch must be an independently controlled, authenticated
 * source. It MUST return a new current snapshot per call, never an arbitrary
 * browser/request-supplied cache. Failures and timeouts are a DENY, not
 * permission to fall back to the D3e15 stale snapshot executor.
 */
type PrivateCancelEpochFenceBootInputV1=Readonly<{
  signedPolicy:PrivateCancelSignedTrustPolicyV1;
  pinnedRoot:PrivateCancelTrustedRootV1;
  pinnedEpochSigner:PrivateCancelTrustedEpochSignerV1;
  readCurrentEpoch:()=>Promise<unknown>;
  trustedClock:()=>Date;
  testStore:PrivateCancelReviewAuthorizedStoreV1;
}>;

/** Shared verification logic. Legacy mode is exclusively for offline tests. */
async function createOfflinePrivateCancelEpochFenceCoreV1(
  input:PrivateCancelEpochFenceBootInputV1,
  durableWatermark?:PrivateCancelDurableEpochWatermarkPortV1,
):Promise<PrivateCancelRevocationFencedExecutorV1>{
  if(typeof input.readCurrentEpoch!=='function'
    ||typeof input.trustedClock!=='function'
    ||typeof input.testStore?.commitAuthorizedReview!=='function'){
    throw new Error('Offline cancel epoch-fenced executor requires trusted boot dependencies.');
  }
  const clock=input.trustedClock;
  const boot=verifyOfflinePrivateCancelSignedTrustPolicyV1({
    envelope:input.signedPolicy,pinnedRoot:input.pinnedRoot,now:clock(),
  });
  assertPrivateCancelEpochSignerSeparateV1({
    pinnedSigner:input.pinnedEpochSigner,
    policyRootPublicKeyPem:input.pinnedRoot.publicKeyPem,
    permitIssuerPublicKeyPems:Object.values(boot.trustedPermitIssuers)
      .filter((x):x is NonNullable<typeof x>=>x!==undefined)
      .map(x=>x.publicKeyPem),
    idpAndOperatorPublicKeyPems:[
      ...Object.values(boot.pinnedIdpKeys)
        .filter((x):x is NonNullable<typeof x>=>x!==undefined)
        .map(x=>x.publicKeyPem),
      ...Object.values(boot.trustedOperatorKeys)
        .filter((x):x is NonNullable<typeof x>=>x!==undefined)
        .map(x=>x.publicKeyPem),
    ],
  });
  const current:PrivateCancelPolicyContextV1=Object.freeze({
    rootKeyId:boot.rootKeyId,policyId:boot.policyId,
    revision:boot.revision,policyDigest:boot.policyDigest,
  });
  const activeIssuers=boot.trustedPermitIssuers;
  const expiry=Date.parse(boot.expiresAt);
  const source=input.readCurrentEpoch,store=input.testStore;
  const signer=Object.freeze({...input.pinnedEpochSigner});
  let seenSequence=0;
  let seenFingerprint='';
  let fenced=false;
  function time():Date{
    const now=clock();
    if(!(now instanceof Date)||!Number.isFinite(now.valueOf())
      ||now.valueOf()>=expiry){
      throw new Error('Offline cancel epoch-fenced executor policy expired or clock invalid.');
    }
    return now;
  }
  async function freshEpoch():Promise<void>{
    if(fenced){
      throw new Error('Offline cancel executor permanently fenced; trusted restart required.');
    }
    const before=time();
    let envelope:unknown;
    try{
      envelope=await source();
    }catch{
      throw new Error('Offline cancel epoch source unavailable: fail closed.');
    }
    // Time is measured AFTER the source read, not at entry: slow / cached
    // responses cannot be accepted using an old time value.
    const now=time();
    if(now.valueOf()<before.valueOf()){
      fenced=true;
      throw new Error('Offline cancel executor clock moved backwards.');
    }
    const verified=verifyPrivateCancelSignedExecutionEpochV1({
      envelope,pinnedSigner:signer,now,
    });
    // Restart-safe entrypoint has an independently owned durable compare-
    // and-commit authority. A missing/corrupted record or any store failure
    // is DENY; a failure permanently fences this process until trusted reboot.
    if(durableWatermark){
      try{
        await durableWatermark.observeVerifiedEpoch(verified);
      }catch{
        fenced=true;
        throw new Error('Offline cancel persistent policy watermark rejected: executor fenced.');
      }
    }
    if(verified.sequence<seenSequence
      ||(verified.sequence===seenSequence
        &&verified.fingerprint!==seenFingerprint)){
      fenced=true;
      throw new Error('Offline cancel epoch rollback/equivocation permanently fenced executor.');
    }
    // An observed HALT or policy change cannot be undone by replaying an
    // earlier ACTIVE snapshot: this instance can only be restarted.
    if(verified.status!=='active'
      ||verified.policyContext.rootKeyId!==current.rootKeyId
      ||verified.policyContext.policyId!==current.policyId
      ||verified.policyContext.revision!==current.revision
      ||verified.policyContext.policyDigest!==current.policyDigest){
      fenced=true;
      throw new Error('Offline cancel active execution policy changed or HALTED; restart required.');
    }
    seenSequence=verified.sequence;
    seenFingerprint=verified.fingerprint;
  }
  // Bootstrap itself needs a currently signed ACTIVE epoch. Refuse to
  // construct a usable executor during an outage or security HALT.
  await freshEpoch();

  return Object.freeze({
    async execute(request:unknown):Promise<PrivateCancelReviewAuthorizedResultV1>{
      if(request===null||typeof request!=='object'||Array.isArray(request)
        ||JSON.stringify(Object.keys(request))!==JSON.stringify(['permit'])){
        throw new Error('Offline cancel epoch executor refuses caller-owned trust/source/store.');
      }
      await freshEpoch();
      const now=time();
      // Verify BOTH D3e15 policy binding and permit issuer signature before
      // even constructing the guarded DB capability.
      const permit=verifyPrivateCancelPolicyBoundPermitV1({
        permit:(request as {permit:PrivateCancelPolicyBoundPermitV1}).permit,
        policyContext:current,trustedPermitIssuers:activeIssuers,now,
      });
      const guardedStore:PrivateCancelReviewAuthorizedStoreV1={
        commitAuthorizedReview:async command=>{
          // Critical second checkpoint after all cryptographic preflight and
          // directly before the one injected test-store RPC.
          await freshEpoch();
          const recent=time();
          verifyPrivateCancelPolicyBoundPermitV1({
            permit:(request as {permit:PrivateCancelPolicyBoundPermitV1}).permit,
            policyContext:current,trustedPermitIssuers:activeIssuers,now:recent,
          });
          return store.commitAuthorizedReview(command);
        },
      };
      return executeSandboxPrivateCancelReviewPermitV1({
        permit,trustedIssuers:activeIssuers,store:guardedStore,now,
      });
    },
  });
}

/**
 * Historical offline factory retained solely for earlier regression vectors.
 * WITHOUT durable watermark this is NOT restart-rollback safe. Do not expose
 * through an API/service/production role.
 */
export function createOfflinePrivateCancelRevocationFencedExecutorV1(
  input:PrivateCancelEpochFenceBootInputV1,
):Promise<PrivateCancelRevocationFencedExecutorV1>{
  return createOfflinePrivateCancelEpochFenceCoreV1(input);
}

/**
 * D3e17 STRICT offline entrypoint: requires a trusted, independently
 * provisioned durable monotonic watermark store BEFORE first epoch read.
 * Missing/corrupted state never auto-initializes; shutdown/rollback remains
 * sticky across restarted application instances sharing the store.
 */
export function createOfflinePrivateCancelRestartSafeExecutorV1(
  input:PrivateCancelEpochFenceBootInputV1 & Readonly<{
    durableWatermark:PrivateCancelDurableEpochWatermarkPortV1;
  }>,
):Promise<PrivateCancelRevocationFencedExecutorV1>{
  if(typeof input.durableWatermark?.observeVerifiedEpoch!=='function'){
    throw new Error('Offline cancel restart-safe executor requires durable monotonic authority.');
  }
  return createOfflinePrivateCancelEpochFenceCoreV1(
    input,input.durableWatermark,
  );
}
