/**
 * D3e16 OFFLINE/SANDBOX: current signed execution-epoch check.
 *
 * Independently pinned epoch-signing public key + trusted read-only provider
 * belong to executor BOOT, never to a request. Every execution re-reads a
 * fresh, strictly signed current-policy epoch; fail closed on revoked,
 * changed, stale, missing, malformed, reordered or replayed epoch updates.
 *
 * This is a *prototype of a revocation fence*, NOT a production revocation
 * source, process boundary, DB-owner containment or atomic financial writer.
 * The trusted epoch source must eventually live in an independently protected
 * service / transactional DB authority with authenticated access and audit.
 */
import {
  createHash,createPublicKey,verify as edVerify,
  type KeyObject,
} from 'node:crypto';
import type {PrivateCancelPolicyContextV1} from
  './official-reader-portone-cancel-private-policy-bound-permit-v1.js';

export type PrivateCancelExecutionEpochBodyV1=Readonly<{
  protocol:'myeongha.cancel.ops.execution-epoch.v1';
  environment:'sandbox';
  audience:'myeongha.cancel.ops.private-executor.v1';
  signerKeyId:string;
  sequence:number;
  status:'active'|'halted';
  rootKeyId:string;
  policyId:string;
  policyRevision:number;
  policyDigest:string;
  issuedAt:string;
  expiresAt:string;
}>;
export type PrivateCancelSignedExecutionEpochV1=Readonly<{
  body:PrivateCancelExecutionEpochBodyV1;
  signatureBase64:string;
}>;
export type PrivateCancelTrustedEpochSignerV1=Readonly<{
  keyId:string;
  publicKeyPem:string;
}>;
export type PrivateCancelVerifiedEpochV1=Readonly<{
  sequence:number;
  status:'active'|'halted';
  policyContext:PrivateCancelPolicyContextV1;
  fingerprint:string;
}>;

const FIELDS=[
  'audience','environment','expiresAt','issuedAt','policyDigest',
  'policyId','policyRevision','protocol','rootKeyId','sequence',
  'signerKeyId','status',
];
const ID=/^epoch_[a-z0-9_]{6,32}$/u;
const ROOT=/^root_[a-z0-9_]{6,32}$/u;
const POLICY=/^policy_[a-z0-9_]{6,32}$/u;
const DIGEST=/^sha256:[a-f0-9]{64}$/u;
const SIG=/^[A-Za-z0-9+/]{86}==$/u;
const MAX_EPOCH_LIFETIME_MS=5000;
const MAX_OBSERVATION_AGE_MS=2000;
const MAX_FUTURE_SKEW_MS=500;

function exact(o:unknown,keys:readonly string[]):o is Record<string,unknown>{
  return o!==null&&typeof o==='object'&&!Array.isArray(o)
    && JSON.stringify(Object.keys(o).sort())===JSON.stringify([...keys].sort());
}
function utcDate(s:unknown):s is string{
  return typeof s==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(s)
    && Number.isFinite(Date.parse(s))
    && new Date(Date.parse(s)).toISOString()===s;
}
function publicEd25519(pem:unknown):KeyObject{
  if(typeof pem!=='string'||pem.length>4096||pem.length<60
    ||!pem.startsWith('-----BEGIN PUBLIC KEY-----\n')){
    throw new Error('Offline cancel epoch requires an independently pinned Ed25519 public key.');
  }
  try{
    const key=createPublicKey(pem);
    if(key.type==='public'&&key.asymmetricKeyType==='ed25519')return key;
  }catch{
    // Invalid PEM is rejected without forwarding provider error details.
  }
  throw new Error('Offline cancel epoch signer must be an Ed25519 public key.');
}

/** This serialization is only meaningful AFTER independently pinning the key. */
export function canonicalPrivateCancelExecutionEpochV1(
  b:PrivateCancelExecutionEpochBodyV1,
):Uint8Array{
  return Buffer.from(JSON.stringify({
    protocol:b.protocol,environment:b.environment,audience:b.audience,
    signerKeyId:b.signerKeyId,sequence:b.sequence,status:b.status,
    rootKeyId:b.rootKeyId,policyId:b.policyId,
    policyRevision:b.policyRevision,policyDigest:b.policyDigest,
    issuedAt:b.issuedAt,expiresAt:b.expiresAt,
  }),'utf8');
}

/**
 * Pure verification; does not contact the epoch source or authorize SQL.
 * Caller must separately confirm sequence monotonicity and exact current
 * root/revision/policy digest against its BOOT-signed policy.
 */
export function verifyPrivateCancelSignedExecutionEpochV1(input:Readonly<{
  envelope:unknown;
  pinnedSigner:PrivateCancelTrustedEpochSignerV1;
  now:Date;
}>):PrivateCancelVerifiedEpochV1{
  const {envelope,pinnedSigner,now}=input;
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf())
    ||!exact(envelope,['body','signatureBase64'])
    ||!exact(envelope.body,FIELDS)
    ||typeof envelope.signatureBase64!=='string'
    ||!SIG.test(envelope.signatureBase64)){
    throw new Error('Offline cancel epoch envelope malformed.');
  }
  const b=envelope.body;
  if(b.protocol!=='myeongha.cancel.ops.execution-epoch.v1'
    ||b.environment!=='sandbox'
    ||b.audience!=='myeongha.cancel.ops.private-executor.v1'
    ||typeof b.signerKeyId!=='string'||!ID.test(b.signerKeyId)
    ||!Number.isSafeInteger(b.sequence)||(b.sequence as number)<1
    ||(b.status!=='active'&&b.status!=='halted')
    ||typeof b.rootKeyId!=='string'||!ROOT.test(b.rootKeyId)
    ||typeof b.policyId!=='string'||!POLICY.test(b.policyId)
    ||!Number.isSafeInteger(b.policyRevision)||(b.policyRevision as number)<1
    ||typeof b.policyDigest!=='string'||!DIGEST.test(b.policyDigest)
    ||!utcDate(b.issuedAt)||!utcDate(b.expiresAt)){
    throw new Error('Offline cancel epoch scope or claim invalid.');
  }
  if(!pinnedSigner||pinnedSigner.keyId!==b.signerKeyId){
    throw new Error('Offline cancel epoch signer is not pinned.');
  }
  const issued=Date.parse(b.issuedAt),expires=Date.parse(b.expiresAt),current=now.valueOf();
  if(issued>current+MAX_FUTURE_SKEW_MS
    ||issued<current-MAX_OBSERVATION_AGE_MS
    ||expires<=current||expires<=issued
    ||expires-issued>MAX_EPOCH_LIFETIME_MS){
    throw new Error('Offline cancel epoch is missing freshness or expired.');
  }
  const raw=Buffer.from(envelope.signatureBase64,'base64');
  if(raw.length!==64||raw.toString('base64')!==envelope.signatureBase64){
    throw new Error('Offline cancel epoch has noncanonical signature.');
  }
  try{
    const key=publicEd25519(pinnedSigner.publicKeyPem);
    if(!edVerify(null,canonicalPrivateCancelExecutionEpochV1(
      b as PrivateCancelExecutionEpochBodyV1,
    ),key,raw)){
      throw new Error('signature invalid');
    }
  }catch{
    throw new Error('Offline cancel epoch signature verification failed.');
  }
  return Object.freeze({
    sequence:b.sequence as number,
    status:b.status as 'active'|'halted',
    policyContext:Object.freeze({
      rootKeyId:b.rootKeyId as string,
      policyId:b.policyId as string,
      revision:b.policyRevision as number,
      policyDigest:b.policyDigest as string,
    }),
    fingerprint:createHash('sha256').update(
      canonicalPrivateCancelExecutionEpochV1(
        b as PrivateCancelExecutionEpochBodyV1,
      ),
    ).digest('hex'),
  });
}

export function assertPrivateCancelEpochSignerSeparateV1(input:Readonly<{
  pinnedSigner:PrivateCancelTrustedEpochSignerV1;
  policyRootPublicKeyPem:string;
  permitIssuerPublicKeyPems:readonly string[];
}>):void{
  if(typeof input.pinnedSigner?.keyId!=='string'
    ||!ID.test(input.pinnedSigner.keyId)){
    throw new Error('Offline cancel epoch signer key ID must be independently pinned.');
  }
  const epoch=publicEd25519(input.pinnedSigner.publicKeyPem);
  const compare=(other:string)=>{
    const otherKey=publicEd25519(other);
    return (epoch.export({type:'spki',format:'der'}) as Buffer).equals(
      otherKey.export({type:'spki',format:'der'}) as Buffer,
    );
  };
  if(compare(input.policyRootPublicKeyPem)
    ||input.permitIssuerPublicKeyPems.some(compare)){
    throw new Error('Offline cancel epoch signer must differ from root and permit signing keys.');
  }
}
