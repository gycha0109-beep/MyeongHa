import {afterAll,describe,expect,it} from 'vitest';
import {tmpdir} from 'node:os';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {
  assertSeyeonS0ReleaseEvidenceV1,
  SEYEON_S0_RELEASE_EVIDENCE_KINDS_V1 as kinds,
} from '../scripts/operations/seyeon-security-s0/release-evidence.mjs';

const sourceSha='a'.repeat(40);
const sha256=(input:string)=>createHash('sha256').update(input).digest('hex');
const root=await mkdtemp(join(tmpdir(),'myeongha-s0-evidence-'));
afterAll(async()=>{await rm(root,{recursive:true,force:true});});
async function makeRelease(override:Record<string,unknown>={}){
  const witnesses=[] as Array<Record<string,unknown>>;
  for(const kind of kinds){
    const contents='isolated signed-output witness '+kind+' '.repeat(100);
    const filePath=join(root,kind+'.txt');
    await writeFile(filePath,contents);
    witnesses.push({kind,passed:true,filePath,sha256:sha256(contents)});
  }
  const release={
    schemaVersion:'seyeon-s0-release-evidence-v1',
    sourceSha,sourceApprovedByProjectOwner:true,
    scope:{recordType:'conversation_recall',schemaVersion:'v1',
      projectorVersion:'seyeon-conversation-recall-projector-v1',
      historyEnabled:false,replayEnabled:false,writableEnabled:false,maxMemoryCount:1},
    witnesses,...override,
  };
  const filePath=join(root,'approval.json');
  await writeFile(filePath,JSON.stringify(release));
  return {filePath,release};
}
describe('S0 exact-head positive release-proof admission',()=>{
  it('admits only complete exact scope and all hash-bound proof artifacts',async()=>{
    const {filePath}=await makeRelease();
    expect(await assertSeyeonS0ReleaseEvidenceV1({filePath,sourceSha}))
      .toMatchObject({sourceSha,witnessCount:5});
  });
  it('denies incorrect HEAD, missing, duplicated or unpassed witnesses',async()=>{
    const {filePath,release}=await makeRelease();
    await expect(assertSeyeonS0ReleaseEvidenceV1({
      filePath,sourceSha:'b'.repeat(40)})).rejects.toThrow();
    for(const witnesses of [
      release.witnesses.slice(1),
      [release.witnesses[0],...release.witnesses.slice(0,4)],
      release.witnesses.map((w,i)=>i===0?{...w,passed:false}:w),
    ]){
      await writeFile(filePath,JSON.stringify({...release,witnesses}));
      await expect(assertSeyeonS0ReleaseEvidenceV1({filePath,sourceSha}))
        .rejects.toThrow();
    }
  });
  it('denies changed proof bytes and unapproved type or hidden history exposure',async()=>{
    const {filePath,release}=await makeRelease();
    await writeFile(String(release.witnesses[0]?.filePath),'replaced witness content with enough bytes to remain a valid file fixture');
    await expect(assertSeyeonS0ReleaseEvidenceV1({filePath,sourceSha}))
      .rejects.toThrow('S0 proof content hash mismatch');
    const fresh=await makeRelease();
    await writeFile(fresh.filePath,JSON.stringify({...fresh.release,
      scope:{...fresh.release.scope,historyEnabled:true}}));
    await expect(assertSeyeonS0ReleaseEvidenceV1({
      filePath:fresh.filePath,sourceSha})).rejects.toThrow();
  });
});
