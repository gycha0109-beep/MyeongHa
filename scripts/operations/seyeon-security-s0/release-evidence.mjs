// Watchtower-Track: security
// The private operator's exact-head source and transport evidence is
// mandatory before turning on any Production original Memory use.
// This is only a verifier; it cannot create or infer a PASS witness.
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';

const HEX=/^[0-9a-f]{64}$/u;
const SHA=/^[0-9a-f]{40}$/u;
export const SEYEON_S0_RELEASE_EVIDENCE_KINDS_V1=Object.freeze([
  'src25-original-memory-codec',
  'g0-d04-edge-revoke-send-ack-race',
  'g1-g2-original-postgres-grant-commit',
  'g3-body-bound-receipt-and-revoke-race',
  'g5-restricted-owner-and-governor-login',
]);

async function strictEvidenceFile(path,sha256){
  if(typeof path!=='string'||!isAbsolute(path) || !HEX.test(sha256??'')){
    throw Error('S0 proof requires an absolute sha256-bound artifact path');
  }
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<40||stat.size>2_000_000){
    throw Error('S0 proof must be a bounded regular file');
  }
  const contents=await readFile(path);
  const found=createHash('sha256').update(contents).digest('hex');
  if(found!==sha256)throw Error('S0 proof content hash mismatch');
}

export async function assertSeyeonS0ReleaseEvidenceV1({filePath,sourceSha}){
  if(typeof filePath!=='string'||!isAbsolute(filePath)||!SHA.test(sourceSha??'')){
    throw Error('S0 release proof location/HEAD missing');
  }
  const fileStat=await lstat(filePath);
  if(!fileStat.isFile()||fileStat.isSymbolicLink()||fileStat.size>32000){
    throw Error('S0 release proof must be a regular bounded file');
  }
  const proof=JSON.parse(await readFile(filePath,'utf8'));
  if(proof?.schemaVersion!=='seyeon-s0-release-evidence-v1'||
     proof?.sourceSha!==sourceSha||
     proof?.sourceApprovedByProjectOwner!==true||
     proof?.scope?.recordType!=='conversation_recall'||
     proof?.scope?.schemaVersion!=='v1'||
     proof?.scope?.projectorVersion!=='seyeon-conversation-recall-projector-v1'||
     proof?.scope?.historyEnabled!==false||
     proof?.scope?.replayEnabled!==false||
     proof?.scope?.writableEnabled!==false||
     proof?.scope?.maxMemoryCount!==1||
     !Array.isArray(proof.witnesses)||proof.witnesses.length!==
       SEYEON_S0_RELEASE_EVIDENCE_KINDS_V1.length){
    throw Error('S0 release scope/approval mismatch');
  }
  const seen=new Set();
  for(const witness of proof.witnesses){
    if(!witness||!SEYEON_S0_RELEASE_EVIDENCE_KINDS_V1.includes(witness.kind)||
       seen.has(witness.kind)||witness.passed!==true){
      throw Error('S0 release witness missing/duplicated/not passed');
    }
    seen.add(witness.kind);
    await strictEvidenceFile(witness.filePath,witness.sha256);
  }
  return Object.freeze({sourceSha,scope:proof.scope,witnessCount:seen.size});
}
