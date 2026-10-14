/**
 * D3e14 OFFLINE ONLY: independently signed, immutable cancellation trust policy.
 * Test fixture, NOT real IdP, live secret store, privileged DB role or service.
 *
 * Trust anchor MUST be provisioned independently at bootstrap, never copied
 * from a request, signed envelope or same untrusted key registry. The caller
 * controlling the boot trust root is still a trusted operator (HOLD).
 */
import {createHash,createPublicKey,verify as edVerify} from 'node:crypto';
import type {
  PrivateCancelReviewRoleV1,PrivateCancelReviewTrustedKeyV1,
} from './official-reader-portone-cancel-private-dual-approval-v1.js';
import type {
  PrivateCancelIdentityDirectoryV1,PrivateCancelIdpTrustV1,
} from './official-reader-portone-cancel-private-identity-attestation-v1.js';
import type {
  PrivateCancelPermitIssuerRegistryV1,
} from './official-reader-portone-cancel-detached-permit-private-v1.js';

export type PrivateCancelTrustOperatorV1=Readonly<{
  orgSubjectId:string;
  principalId:string;
  signingKeyId:string;
  role:PrivateCancelReviewRoleV1;
  status:'active'|'disabled';
  publicKeyPem:string;
}>;
export type PrivateCancelTrustIssuerV1=Readonly<{
  keyId:string;
  publicKeyPem:string;
  enabled:boolean;
}>;
export type PrivateCancelSignedTrustPolicyBodyV1=Readonly<{
  protocol:'myeongha.cancel.ops.signed-trust-policy.v1';
  environment:'sandbox';
  audience:'myeongha.cancel.ops.offline-boundaries.v1';
  policyId:string;
  revision:number;
  issuedAt:string;
  expiresAt:string;
  operators:readonly PrivateCancelTrustOperatorV1[];
  idpIssuers:readonly PrivateCancelTrustIssuerV1[];
  permitIssuers:readonly PrivateCancelTrustIssuerV1[];
}>;
export type PrivateCancelSignedTrustPolicyV1=Readonly<{
  rootKeyId:string;
  policy:PrivateCancelSignedTrustPolicyBodyV1;
  signatureBase64:string;
}>;
export type PrivateCancelTrustedRootV1=Readonly<{
  keyId:string;
  publicKeyPem:string;
  minimumRevision:number;
}>;

export type PrivateCancelOfflineValidatedPolicyV1=Readonly<{
  policyId:string;
  revision:number;
  expiresAt:string;
  trustedOperatorKeys:Readonly<Record<string,PrivateCancelReviewTrustedKeyV1|undefined>>;
  trustedIdentityDirectory:PrivateCancelIdentityDirectoryV1;
  pinnedIdpKeys:PrivateCancelIdpTrustV1;
  trustedPermitIssuers:PrivateCancelPermitIssuerRegistryV1;
}>;

const BODY_FIELDS=[
  'audience','environment','expiresAt','idpIssuers','issuedAt',
  'operators','permitIssuers','policyId','protocol','revision',
];
const OP_FIELDS=[
  'orgSubjectId','principalId','publicKeyPem','role','signingKeyId','status',
];
const ISSUER_FIELDS=['enabled','keyId','publicKeyPem'];
const UTF8_SIG=/^[A-Za-z0-9+/]{86}==$/u;
const ID=/^policy_[a-z0-9_]{6,32}$/u;
const ROOT=/^root_[a-z0-9_]{6,32}$/u;
const ORG=/^org_[a-z0-9_]{6,32}$/u;
const PERSON=/^op_[a-z0-9_]{6,32}$/u;
const USER_KEY=/^key_[a-z0-9_]{6,32}$/u;
const IDP_KEY=/^idp_[a-z0-9_]{6,32}$/u;
const PERMIT_KEY=/^issuer_[a-z0-9_]{6,32}$/u;

function exact(value:unknown,fields:readonly string[]):value is Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())===JSON.stringify([...fields].sort());
}
function iso(value:unknown):value is string{
  return typeof value==='string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString()===value;
}
function keyPem(value:unknown):value is string{
  if(typeof value!=='string' || value.length<60 || value.length>4096
    || !value.startsWith('-----BEGIN PUBLIC KEY-----\n')
    || !value.trimEnd().endsWith('-----END PUBLIC KEY-----')) return false;
  try{
    const pub=createPublicKey(value);
    return pub.type==='public' && pub.asymmetricKeyType==='ed25519';
  }catch{
    return false;
  }
}
function fingerprint(pem:string):string {
  const key=createPublicKey(pem);
  return createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
function operators(value:unknown):PrivateCancelTrustOperatorV1[]{
  if(!Array.isArray(value) || value.length<2 || value.length>30){
    throw new Error('Offline cancel trust policy requires bounded operators.');
  }
  const orgs=new Set<string>(),people=new Set<string>(),keys=new Set<string>(),cryptoKeys=new Set<string>();
  const result:PrivateCancelTrustOperatorV1[]=[];
  for(const raw of value){
    if(!exact(raw,OP_FIELDS) || typeof raw.orgSubjectId!=='string'
      || !ORG.test(raw.orgSubjectId) || typeof raw.principalId!=='string'
      || !PERSON.test(raw.principalId) || typeof raw.signingKeyId!=='string'
      || !USER_KEY.test(raw.signingKeyId)
      || (raw.role!=='requester' && raw.role!=='approver')
      || (raw.status!=='active' && raw.status!=='disabled')
      || !keyPem(raw.publicKeyPem)){
      throw new Error('Offline cancel trust policy has invalid operator assignment.');
    }
    if(orgs.has(raw.orgSubjectId)||people.has(raw.principalId)
      || keys.has(raw.signingKeyId) || cryptoKeys.has(fingerprint(raw.publicKeyPem))){
      throw new Error('Offline cancel trust policy has duplicate operator identity or signing key.');
    }
    orgs.add(raw.orgSubjectId);people.add(raw.principalId);keys.add(raw.signingKeyId);
    cryptoKeys.add(fingerprint(raw.publicKeyPem));
    result.push(Object.freeze({
      orgSubjectId:raw.orgSubjectId,principalId:raw.principalId,
      signingKeyId:raw.signingKeyId,role:raw.role,status:raw.status,
      publicKeyPem:raw.publicKeyPem,
    }));
  }
  if(!result.some(x=>x.role==='requester' && x.status==='active')
    || !result.some(x=>x.role==='approver' && x.status==='active')){
    throw new Error('Offline cancel trust policy requires independent active roles.');
  }
  return result.sort((a,b)=>a.orgSubjectId.localeCompare(b.orgSubjectId));
}
function issuers(value:unknown,pattern:RegExp,label:string):PrivateCancelTrustIssuerV1[]{
  if(!Array.isArray(value)||value.length<1||value.length>8){
    throw new Error('Offline cancel trust policy requires bounded '+label+' issuers.');
  }
  const ids=new Set<string>();
  const result:PrivateCancelTrustIssuerV1[]=[];
  for(const raw of value){
    if(!exact(raw,ISSUER_FIELDS)||typeof raw.keyId!=='string'
      || !pattern.test(raw.keyId)||typeof raw.enabled!=='boolean'
      || !keyPem(raw.publicKeyPem)){
      throw new Error('Offline cancel trust policy has invalid '+label+' issuer.');
    }
    if(ids.has(raw.keyId))throw new Error('Offline cancel trust policy has duplicate '+label+' key.');
    ids.add(raw.keyId);
    result.push(Object.freeze({
      keyId:raw.keyId,enabled:raw.enabled,publicKeyPem:raw.publicKeyPem,
    }));
  }
  if(!result.some(x=>x.enabled)){
    throw new Error('Offline cancel trust policy needs an active '+label+' issuer.');
  }
  return result.sort((a,b)=>a.keyId.localeCompare(b.keyId));
}
/**
 * Exact canonical signed representation. The root ID is signed together with
 * the normalized/ordered policy so that key-ID substitution also fails.
 * Caller must not use this alone to establish authority; verify root first.
 */
export function canonicalPrivateCancelTrustPolicyV1(
  rootKeyId:string, body:PrivateCancelSignedTrustPolicyBodyV1,
):Uint8Array{
  return Buffer.from(JSON.stringify({
    rootKeyId,
    policy:{
      protocol:body.protocol,environment:body.environment,
      audience:body.audience,policyId:body.policyId,revision:body.revision,
      issuedAt:body.issuedAt,expiresAt:body.expiresAt,
      operators:body.operators.map(o=>({
        orgSubjectId:o.orgSubjectId,principalId:o.principalId,
        signingKeyId:o.signingKeyId,role:o.role,status:o.status,
        publicKeyPem:o.publicKeyPem,
      })).sort((a,b)=>a.orgSubjectId.localeCompare(b.orgSubjectId)),
      idpIssuers:body.idpIssuers.map(x=>({
        keyId:x.keyId,publicKeyPem:x.publicKeyPem,enabled:x.enabled,
      })).sort((a,b)=>a.keyId.localeCompare(b.keyId)),
      permitIssuers:body.permitIssuers.map(x=>({
        keyId:x.keyId,publicKeyPem:x.publicKeyPem,enabled:x.enabled,
      })).sort((a,b)=>a.keyId.localeCompare(b.keyId)),
    },
  }),'utf8');
}

export function verifyOfflinePrivateCancelSignedTrustPolicyV1(input:Readonly<{
  envelope:unknown;
  pinnedRoot:PrivateCancelTrustedRootV1;
  now:Date;
}>):PrivateCancelOfflineValidatedPolicyV1{
  if(!(input.now instanceof Date)||!Number.isFinite(input.now.valueOf())
    || !exact(input.envelope,['policy','rootKeyId','signatureBase64'])
    || !exact(input.envelope.policy,BODY_FIELDS)
    || typeof input.envelope.rootKeyId!=='string'
    || !ROOT.test(input.envelope.rootKeyId)
    || typeof input.envelope.signatureBase64!=='string'
    || !UTF8_SIG.test(input.envelope.signatureBase64)){
    throw new Error('Offline cancel signed policy envelope is malformed.');
  }
  const root=input.pinnedRoot;
  if(!root || root.keyId!==input.envelope.rootKeyId
    || !keyPem(root.publicKeyPem)
    || !Number.isSafeInteger(root.minimumRevision) || root.minimumRevision<1){
    throw new Error('Offline cancel signed policy root is not independently pinned.');
  }
  const p=input.envelope.policy;
  if(p.protocol!=='myeongha.cancel.ops.signed-trust-policy.v1'
    || p.environment!=='sandbox'
    || p.audience!=='myeongha.cancel.ops.offline-boundaries.v1'
    || typeof p.policyId!=='string'||!ID.test(p.policyId)
    || !Number.isSafeInteger(p.revision)||(p.revision as number)<=0
    || (p.revision as number)<root.minimumRevision
    || !iso(p.issuedAt)||!iso(p.expiresAt)){
    throw new Error('Offline cancel signed policy context or revision rejected.');
  }
  const now=input.now.getTime(),issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
  if(issued>now+30_000 || expires<=now || expires<=issued
    || expires-issued>24*60*60_000){
    throw new Error('Offline cancel signed policy expired, future or overlong.');
  }
  const ops=operators(p.operators);
  const idps=issuers(p.idpIssuers,IDP_KEY,'IdP');
  const permits=issuers(p.permitIssuers,PERMIT_KEY,'permit');
  // Key-ID separation alone is insufficient. Never reuse the same Ed25519
  // key across operator, IdP, permit issuer or independent trust root roles.
  const allKeys=[root.publicKeyPem,...ops.map(x=>x.publicKeyPem),
    ...idps.map(x=>x.publicKeyPem),...permits.map(x=>x.publicKeyPem)]
    .map(fingerprint);
  if(new Set(allKeys).size!==allKeys.length){
    throw new Error('Offline cancel trust policy reuses a cryptographic key across trust roles.');
  }
  const validBody:PrivateCancelSignedTrustPolicyBodyV1={
    protocol:'myeongha.cancel.ops.signed-trust-policy.v1',
    environment:'sandbox',audience:'myeongha.cancel.ops.offline-boundaries.v1',
    policyId:p.policyId,revision:p.revision as number,
    issuedAt:p.issuedAt,expiresAt:p.expiresAt,
    operators:ops,idpIssuers:idps,permitIssuers:permits,
  };
  const bytes=canonicalPrivateCancelTrustPolicyV1(root.keyId,validBody);
  if(bytes.byteLength>65536){
    throw new Error('Offline cancel signed policy exceeds maximum size.');
  }
  const sig=Buffer.from(input.envelope.signatureBase64,'base64');
  if(sig.length!==64||sig.toString('base64')!==input.envelope.signatureBase64){
    throw new Error('Offline cancel signed policy signature encoding invalid.');
  }
  try{
    if(!edVerify(null,bytes,createPublicKey(root.publicKeyPem),sig)){
      throw new Error('invalid root signature');
    }
  }catch{
    throw new Error('Offline cancel signed policy root signature failed.');
  }
  const opKeys:Record<string,PrivateCancelReviewTrustedKeyV1|undefined>=Object.create(null);
  const directory:Record<string,{principalId:string;signingKeyId:string;role:PrivateCancelReviewRoleV1;status:'active'|'disabled'}|undefined>=Object.create(null);
  for(const o of ops){
    directory[o.orgSubjectId]=Object.freeze({
      principalId:o.principalId,signingKeyId:o.signingKeyId,
      role:o.role,status:o.status,
    });
    opKeys[o.signingKeyId]=Object.freeze({
      principalId:o.principalId,role:o.role,
      publicKeyPem:o.publicKeyPem,enabled:true,
    });
    // Disabled directory subjects have no trusted signing keys at all.
    if(o.status!=='active')delete opKeys[o.signingKeyId];
  }
  const idpKeys:Record<string,{publicKeyPem:string;enabled:boolean}|undefined>=Object.create(null);
  for(const k of idps)idpKeys[k.keyId]=Object.freeze({
    publicKeyPem:k.publicKeyPem,enabled:k.enabled,
  });
  const permitKeys:Record<string,{publicKeyPem:string;enabled:true}|undefined>=Object.create(null);
  for(const k of permits)if(k.enabled)permitKeys[k.keyId]=Object.freeze({
    publicKeyPem:k.publicKeyPem,enabled:true,
  });
  return Object.freeze({
    policyId:validBody.policyId,
    revision:validBody.revision,
    expiresAt:validBody.expiresAt,
    trustedOperatorKeys:Object.freeze(opKeys),
    trustedIdentityDirectory:Object.freeze(directory),
    pinnedIdpKeys:Object.freeze(idpKeys),
    trustedPermitIssuers:Object.freeze(permitKeys),
  });
}
