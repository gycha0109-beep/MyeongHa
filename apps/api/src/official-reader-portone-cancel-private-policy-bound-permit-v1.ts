/**
 * D3e15 OFFLINE/SANDBOX ONLY: bind every D3e14-issued review permit to the
 * exact root-signed trust-policy snapshot and its revision.
 *
 * Outer Ed25519 signature by the independently pinned permit issuer covers
 * policy identity, revision, root ID, canonical policy SHA-256 and the exact
 * INNER Ed25519 permit (including its signature). Both signatures are checked
 * BEFORE the executor can call the isolated DB-owner TEST store.
 *
 * Rebooting an executor with a new signed revision/key roster rejects an old
 * bound permit even if the inner permit's 60-second TTL has not expired.
 * This is NOT automatic revocation of already-running old executors, a live
 * revocation channel, a production identity service or DB-owner containment.
 */
import {
  createHash,createPublicKey,timingSafeEqual,verify as edVerify,
} from 'node:crypto';
import {
  canonicalPrivateCancelDetachedPermitV1,
  validateSandboxPrivateCancelDetachedPayloadV1,
  type PrivateCancelDetachedPermitV1,
  type PrivateCancelPermitIssuerRegistryV1,
} from './official-reader-portone-cancel-detached-permit-private-v1.js';

export type PrivateCancelPolicyContextV1=Readonly<{
  rootKeyId:string;
  policyId:string;
  revision:number;
  policyDigest:string;
}>;

export type PrivateCancelPermitPolicyBindingV1=Readonly<{
  protocol:'myeongha.cancel.ops.policy-bound-permit.v1';
  environment:'sandbox';
  rootKeyId:string;
  policyId:string;
  policyRevision:number;
  policyDigest:string;
  issuerKeyId:string;
  permitDigest:string;
}>;

export type PrivateCancelPolicyBoundPermitV1=PrivateCancelDetachedPermitV1 & Readonly<{
  policyBinding:PrivateCancelPermitPolicyBindingV1;
  policyBindingSignatureBase64:string;
}>;

const ROOT=/^root_[a-z0-9_]{6,32}$/u;
const POLICY=/^policy_[a-z0-9_]{6,32}$/u;
const ISSUER=/^issuer_[a-z0-9_]{6,32}$/u;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;
const SIG=/^[A-Za-z0-9+/]{86}==$/u;
const BINDING_FIELDS=[
  'environment','issuerKeyId','permitDigest','policyDigest',
  'policyId','policyRevision','protocol','rootKeyId',
];
const ENVELOPE_FIELDS=[
  'payload','policyBinding','policyBindingSignatureBase64',
  'signatureBase64',
];
function exact(input:unknown,expected:readonly string[]):input is Record<string,unknown>{
  return input!==null && typeof input==='object' && !Array.isArray(input)
    && JSON.stringify(Object.keys(input).sort())===JSON.stringify([...expected].sort());
}
function goodB64(input:unknown):input is string{
  if(typeof input!=='string'||!SIG.test(input))return false;
  const buffer=Buffer.from(input,'base64');
  return buffer.byteLength===64&&buffer.toString('base64')===input;
}
function validContext(input:unknown):PrivateCancelPolicyContextV1{
  if(!exact(input,['policyDigest','policyId','revision','rootKeyId'])
    || typeof input.rootKeyId!=='string'||!ROOT.test(input.rootKeyId)
    || typeof input.policyId!=='string'||!POLICY.test(input.policyId)
    || !Number.isSafeInteger(input.revision)||(input.revision as number)<1
    || typeof input.policyDigest!=='string'||!DIGEST.test(input.policyDigest)){
    throw new Error('Offline cancel policy-bound permit needs a verified policy context.');
  }
  return Object.freeze({
    rootKeyId:input.rootKeyId,policyId:input.policyId,
    revision:input.revision as number,policyDigest:input.policyDigest,
  });
}
/** Hash of the exact inner signed permit; not equivalent to its statement hash. */
export function digestPrivateCancelSignedPermitV1(
  permit:unknown,now:Date,
):string{
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf())
    || !exact(permit,['payload','signatureBase64'])
    || !goodB64(permit.signatureBase64)){
    throw new Error('Offline cancel policy binding requires one canonical signed permit.');
  }
  const validated=validateSandboxPrivateCancelDetachedPayloadV1(permit.payload,now);
  return 'sha256:'+createHash('sha256')
    .update('myeongha.cancel.ops.policy-bound-inner-permit.v1\0')
    .update(canonicalPrivateCancelDetachedPermitV1(validated))
    .update('\0')
    .update(Buffer.from(permit.signatureBase64,'base64'))
    .digest('hex');
}
/** Deterministic fixed-field wire format. Signing a digest alone is NOT a grant. */
export function canonicalPrivateCancelPermitPolicyBindingV1(
  binding:PrivateCancelPermitPolicyBindingV1,
):Uint8Array{
  return Buffer.from(JSON.stringify({
    protocol:binding.protocol,environment:binding.environment,
    rootKeyId:binding.rootKeyId,
    policyId:binding.policyId,policyRevision:binding.policyRevision,
    policyDigest:binding.policyDigest,
    issuerKeyId:binding.issuerKeyId,permitDigest:binding.permitDigest,
  }),'utf8');
}

export function buildPrivateCancelPermitPolicyBindingV1(input:Readonly<{
  policyContext:PrivateCancelPolicyContextV1;
  innerPermit:PrivateCancelDetachedPermitV1;
  now:Date;
}>):PrivateCancelPermitPolicyBindingV1{
  const context=validContext(input.policyContext);
  const digest=digestPrivateCancelSignedPermitV1(input.innerPermit,input.now);
  const issuer=input.innerPermit.payload.issuerKeyId;
  if(typeof issuer!=='string'||!ISSUER.test(issuer)){
    throw new Error('Offline cancel policy binding has an invalid permit issuer.');
  }
  return Object.freeze({
    protocol:'myeongha.cancel.ops.policy-bound-permit.v1',
    environment:'sandbox',rootKeyId:context.rootKeyId,
    policyId:context.policyId,policyRevision:context.revision,
    policyDigest:context.policyDigest,issuerKeyId:issuer,
    permitDigest:digest,
  });
}

/**
 * Pure executor check. Neither a request-supplied policy/root nor an IdP
 * registry is accepted. The separately root-verified active policy context
 * and permit-issuer public keys MUST originate from trusted executor boot.
 * No DB store is called here.
 */
export function verifyPrivateCancelPolicyBoundPermitV1(input:Readonly<{
  permit:unknown;
  policyContext:PrivateCancelPolicyContextV1;
  trustedPermitIssuers:PrivateCancelPermitIssuerRegistryV1;
  now:Date;
}>):PrivateCancelDetachedPermitV1{
  const current=validContext(input.policyContext);
  if(!exact(input.permit,ENVELOPE_FIELDS)
    || !exact(input.permit.policyBinding,BINDING_FIELDS)
    || !goodB64(input.permit.signatureBase64)
    || !goodB64(input.permit.policyBindingSignatureBase64)){
    throw new Error('Offline cancel policy-bound permit envelope or signatures invalid.');
  }
  const binding=input.permit.policyBinding;
  if(binding.protocol!=='myeongha.cancel.ops.policy-bound-permit.v1'
    || binding.environment!=='sandbox'
    || typeof binding.rootKeyId!=='string'||!ROOT.test(binding.rootKeyId)
    || typeof binding.policyId!=='string'||!POLICY.test(binding.policyId)
    || !Number.isSafeInteger(binding.policyRevision)
    || (binding.policyRevision as number)<1
    || typeof binding.policyDigest!=='string'||!DIGEST.test(binding.policyDigest)
    || typeof binding.issuerKeyId!=='string'||!ISSUER.test(binding.issuerKeyId)
    || typeof binding.permitDigest!=='string'||!DIGEST.test(binding.permitDigest)){
    throw new Error('Offline cancel policy-bound permit scope invalid.');
  }
  if(binding.rootKeyId!==current.rootKeyId
    || binding.policyId!==current.policyId
    || binding.policyRevision!==current.revision
    || binding.policyDigest!==current.policyDigest){
    throw new Error('Offline cancel policy-bound permit does not match ACTIVE signed policy.');
  }
  const inner:PrivateCancelDetachedPermitV1={
    payload:validateSandboxPrivateCancelDetachedPayloadV1(input.permit.payload,input.now),
    signatureBase64:input.permit.signatureBase64,
  };
  if(inner.payload.issuerKeyId!==binding.issuerKeyId){
    throw new Error('Offline cancel policy-bound permit issuer differs from inner permit.');
  }
  const computed=digestPrivateCancelSignedPermitV1(inner,input.now);
  if(!timingSafeEqual(
    Buffer.from(computed.slice(7),'hex'),Buffer.from(binding.permitDigest.slice(7),'hex')
  )){
    throw new Error('Offline cancel policy-bound permit inner signed digest mismatched.');
  }
  const registry=input.trustedPermitIssuers;
  if(!registry||typeof registry!=='object'||Array.isArray(registry)){
    throw new Error('Offline cancel policy-bound permit requires pinned issuer keys.');
  }
  const key=registry[binding.issuerKeyId];
  if(!key||key.enabled!==true||typeof key.publicKeyPem!=='string'
    || key.publicKeyPem.length>4096){
    throw new Error('Offline cancel policy-bound permit issuer was revoked or unknown.');
  }
  try{
    const publicKey=createPublicKey(key.publicKeyPem);
    if(publicKey.type!=='public'||publicKey.asymmetricKeyType!=='ed25519'
      || !edVerify(
        null,canonicalPrivateCancelPermitPolicyBindingV1(
          binding as PrivateCancelPermitPolicyBindingV1,
        ),publicKey,Buffer.from(input.permit.policyBindingSignatureBase64,'base64'),
      )){
      throw new Error('bad outer signature');
    }
  }catch{
    throw new Error('Offline cancel policy-bound permit signature verification failed.');
  }
  // D3e10 separately verifies the INNER signature before any DB effect.
  return Object.freeze(inner);
}
