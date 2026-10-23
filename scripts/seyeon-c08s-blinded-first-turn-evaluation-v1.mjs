/**
 * C08-S: offline ONLY, future human-evaluation packing for 8 ordinary
 * immutable C07 first-contact prompts. This does not call models, validate
 * provenance or grant access to personal data, certify quality or modify
 * production routing. Both real-provider sampling and human review remain HOLD.
 */
import { createHash } from 'node:crypto';
import { SEYEON_C07_BOUNDARY_MATRIX_V1 as GOLD }
 from './seyeon-cost-c07-cross-topic-boundary-v1.mjs';

export const SEYEON_C08S_ORDINARY_GOLD_IDS_V1=Object.freeze([
 'N01','N02','N05','N09','N14','N16','N17','N18',
]);
const SOURCE=new Map(GOLD.map(x=>[x.id,x]));
for(const id of SEYEON_C08S_ORDINARY_GOLD_IDS_V1){
 const gold=SOURCE.get(id);
 if(!gold||gold.topic!==null||gold.expectedKinds.length!==0)
  throw Error('C08-S ordinary synthetic Gold contract changed');
}
const RESPONSE_KEYS=[
 'guardApproved','memoryRefs','privateSourceRefs','revealLevel','utterance',
];
const PAIR_KEYS=['candidate','id','legacy'];
function reject(){
 throw TypeError('C08-S requires bounded synthetic first-contact public evidence');
}
function validResponse(response){
 if(!response||typeof response!=='object'||Array.isArray(response)||
    Object.keys(response).sort().join('|')!==RESPONSE_KEYS.join('|')||
    response.guardApproved!==true||response.revealLevel!=='public'||
    !Array.isArray(response.memoryRefs)||response.memoryRefs.length!==0||
    !Array.isArray(response.privateSourceRefs)||response.privateSourceRefs.length!==0||
    typeof response.utterance!=='string'||
    response.utterance.trim()!==response.utterance||
    response.utterance.length<1||response.utterance.length>500||
    /[\u0000-\u001f\u007f]/u.test(response.utterance))
   reject();
}
function prepare(input){
 if(!input||typeof input.seed!=='string'||input.seed.length<16||
    input.seed.length>256||!Array.isArray(input.pairs)||
    input.pairs.length!==SEYEON_C08S_ORDINARY_GOLD_IDS_V1.length)reject();
 const pairs=new Map();
 for(const p of input.pairs){
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).sort().join('|')!==PAIR_KEYS.join('|')||
     !SEYEON_C08S_ORDINARY_GOLD_IDS_V1.includes(p.id)||
     pairs.has(p.id))reject();
  validResponse(p.legacy);
  validResponse(p.candidate);
  pairs.set(p.id,p);
 }
 const shuffled=SEYEON_C08S_ORDINARY_GOLD_IDS_V1.map(id=>({
  id,
  digest:createHash('sha256').update(input.seed).update('\0').update(id).digest('hex'),
 })).sort((a,b)=>a.digest.localeCompare(b.digest));
 const candidateA=new Set(shuffled.slice(0,4).map(x=>x.id));
 const key=SEYEON_C08S_ORDINARY_GOLD_IDS_V1.map(id=>Object.freeze({
  id, A:candidateA.has(id)?'candidate':'legacy',
  B:candidateA.has(id)?'legacy':'candidate',
 }));
 return {pairs,key};
}

/** Reviewer-only material: NO labels, seeds, keys, provider IDs or costs. */
export function buildSeyeonC08SReviewerPackV1(input){
 const {pairs,key}=prepare(input);
 return Object.freeze({
  schemaVersion:'seyeon-c08s-reviewer-pack-v1',
  scope:'OFFLINE_PREPARATION_NOT_MODEL_OR_HUMAN_EVIDENCE',
  items:Object.freeze(key.map(a=>{
   const p=pairs.get(a.id);
   return Object.freeze({
    id:a.id,
    syntheticPrompt:SOURCE.get(a.id).text,
    A:a.A==='candidate'?p.candidate.utterance:p.legacy.utterance,
    B:a.B==='candidate'?p.candidate.utterance:p.legacy.utterance,
   });
  })),
 });
}

/** Owner-only label mapping: NEVER distribute with reviewer packets. */
export function buildSeyeonC08SOwnerKeyV1(input){
 const {key}=prepare(input);
 return Object.freeze({
  schemaVersion:'seyeon-c08s-owner-key-v1',
  scope:'OFFLINE_OWNER_ONLY_NOT_MODEL_EVIDENCE',
  assignments:Object.freeze(key),
 });
}
