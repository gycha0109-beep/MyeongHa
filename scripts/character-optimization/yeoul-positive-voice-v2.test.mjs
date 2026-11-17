import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileYeoulPositiveVoiceV2,classifyYeoulMove} from './yeoul-positive-voice-v2.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=(file)=>readFileSync(join(root,file),'utf8');
const bible=source('docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md');
const runtime=source('docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md');
const compile=(userMove,changes={})=>compileYeoulPositiveVoiceV2({
  bibleMarkdown:bible,runtimeMarkdown:runtime,userMove,...changes});
test('honors source-authored Yeoul voice (not a generic counselor)',()=>{
 const result=compile('오늘 기분이 좀 허전해요.');
 assert.equal(result.characterId,'yeoul');
 assert.equal(result.situation,'care');
 assert.equal(result.authority,'DRAFT_NOT_PRODUCTION');
 assert.deepEqual(result.messages.map(x=>x.role),['system','user']);
 const system=result.messages[0].content;
 for(const anchor of [
   '신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자',
   '살짝 새침하지만 과하게 차갑지 않은 존댓말',
   '건조한 태클형','react_quickly','care_before_label',
   'R6.2 caring_leak','R8.1 Normal Care','상담사식 연속 심층 질문'
 ])assert.ok(system.includes(anchor),'Missing '+anchor);
 assert.ok(!system.includes('# 세연 Character Bible'));
 assert.ok(system.includes('반말'));
 assert.equal(result.response_format.json_schema.name,'yeoul_reply');
 assert.equal(result.relationshipStage,'no_history');
});
test('a direct attention question chooses caught response instead of care',()=>{
 const result=compile('저 신경 쓰여요?');
 assert.equal(result.situation,'caught');
 assert.ok(result.messages[0].content.includes('R6.3 caught'));
 assert.ok(!result.messages[0].content.includes('R8.1 Normal Care'));
});
test('baseline situation does not import unrelated relationship evidence',()=>{
 const result=compile('다음 주말에 뭐 하면 좋을까요?');
 assert.equal(result.situation,'baseline');
 assert.ok(result.messages[0].content.includes('R6.1 baseline'));
 assert.ok(!result.messages[0].content.includes('R6.3 caught'));
 assert.ok(result.messages[0].content.includes('관계 근거: 없음'));
});
test('tampered runtime and invented relationship fail before any provider call',()=>{
 assert.throws(()=>compile('허전해요',{runtimeMarkdown:runtime+'added'}),/PINNED_RUNTIME_SOURCE/);
 assert.throws(()=>compile('허전해요',{relationshipStage:'attached'}),/UNKNOWN_RELATIONSHIP_STAGE/);
 assert.throws(()=>compile('',{}),/USER_MOVE/);
});
