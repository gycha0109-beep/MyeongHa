import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildPrivateV7,buildFromPrivateFiles} from './yeoul-user-reviewed-v7.mjs';
import {UNSEEN_CASES,V6_SYSTEM} from './yeoul-everyday-reaction-v6.mjs';

function fixture(){
 const pairs=UNSEEN_CASES.map(c=>({id:c.id,message:c.message,v5:{text:'synthetic v5'},v6:{text:'synthetic v6'}}));
 const cases=UNSEEN_CASES.map((c,i)=>({id:c.id,preferred:'v6',
  natural_korean_v5:1,natural_korean_v6:2,yeoul_character_v5:1,yeoul_character_v6:2,
  reason:'합성 부정 예시\n\n내가 원한 느낌 : 이거 완전히 가상의 '+i+'번 문장입니다.',
  hard_failures_v5:[],hard_failures_v6:[]}));
 return {pairs,review:{status:'HUMAN_REVIEWED',source_sha256:'a'.repeat(64),cases}};
}
test('nine private desired phrases inform candidate but source review text is not printed',()=>{
 const {pairs,review}=fixture();
 const x=buildPrivateV7(review,pairs);
 assert.equal(x.anchorCount,9);
 assert.equal(x.sourceVersion,'v6');
 assert.ok(x.system.startsWith(V6_SYSTEM+'\n'));
 assert.match(x.system,/이거 완전히 가상의 8번 문장입니다/);
 assert.doesNotMatch(x.system,/합성 부정 예시/);
 assert.match(x.system,/실제로 카톡/);
 assert.equal(x.productionEligible,false);
});
test('refuses no actual human notes and incomplete scores',()=>{
 const {pairs,review}=fixture();
 review.cases[3].reason='점수만 남김';
 assert.throws(()=>buildPrivateV7(review,pairs),/PREFERRED_EXAMPLE_MISSING/);
 review.cases[3].reason='내가 원한 느낌 : 합성';
 review.cases[3].natural_korean_v5=null;
 assert.throws(()=>buildPrivateV7(review,pairs),/UNVERIFIED_HUMAN_RATINGS/);
});
test('requires matching original evidence hash and valid source model',()=>{
 const {pairs,review}=fixture();
 const folder=mkdtempSync(join(tmpdir(),'yeoul-v7-test-'));
 try{
  const source={model:'openai/gpt-6-luna',completedCalls:18,rows:pairs};
  const sourcePath=join(folder,'source.json');
  const reviewPath=join(folder,'review.json');
  writeFileSync(sourcePath,JSON.stringify(source));
  writeFileSync(reviewPath,JSON.stringify(review));
  assert.throws(()=>buildFromPrivateFiles(reviewPath,sourcePath),/REVIEW_SOURCE_HASH_MISMATCH/);
  review.source_sha256=createHash('sha256').update(JSON.stringify(source)).digest('hex');
  writeFileSync(reviewPath,JSON.stringify(review));
  assert.equal(buildFromPrivateFiles(reviewPath,sourcePath).anchorCount,9);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
