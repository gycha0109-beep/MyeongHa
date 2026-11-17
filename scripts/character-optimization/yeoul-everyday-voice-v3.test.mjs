import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileYeoulEverydayVoiceV3,EVERYDAY_VOICE_SYNTHETIC_CASES,assessYeoulEverydayVoiceV3} from './yeoul-everyday-voice-v3.mjs';
import {YEOUL_VOICE_SOURCE} from './yeoul-positive-voice-v2.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const bible=readFileSync(join(root,YEOUL_VOICE_SOURCE.bible),'utf8');
const runtime=readFileSync(join(root,YEOUL_VOICE_SOURCE.runtime),'utf8');
const compile=(userMove,more={})=>compileYeoulEverydayVoiceV3({bibleMarkdown:bible,runtimeMarkdown:runtime,userMove,...more});
test('all ten ordinary turns receive the same permanent personality and judgment workflow',()=>{
 assert.equal(EVERYDAY_VOICE_SYNTHETIC_CASES.length,10);
 const results=EVERYDAY_VOICE_SYNTHETIC_CASES.map(compile);
 assert.equal(new Set(results.map(v=>v.hashes.system)).size,1);
 assert.equal(new Set(results.map(v=>v.hashes.runtime)).size,1);
 for(let i=0;i<results.length;i++){
   const item=results[i];
   assert.deepEqual(item.messages.map(m=>m.role),['system','user']);
   assert.equal(item.messages[1].content,EVERYDAY_VOICE_SYNTHETIC_CASES[i]);
   assert.equal(item.characterId,'yeoul');
   assert.equal(item.relationshipStage,'no_history');
   assert.equal(item.authority,'DRAFT_NOT_PRODUCTION');
   assert.equal(item.model,'openai/gpt-6-luna');
   const p=item.messages[0].content;
   for(const anchor of ['R1.2 Runtime Thesis for Yeoul','R6.1 baseline',
     'R6.2 caring_leak','R8.1 Normal Care','R5.1 Preferred Actions',
     'E1. 기본 말투','실제 대사','첫 문장','reply 하나',
     '민망한 부정은 실제로 관심이 지적됐을 때만']){
     assert.ok(p.includes(anchor),'Missing '+anchor);
   }
   assert.ok(!p.includes('오늘 기분이 좀 허전해요.'),'No canned test response in system');
   assert.ok(Buffer.byteLength(JSON.stringify(item.messages),'utf8')<=16000);
   assert.equal(item.response_format.json_schema.schema.required.join(','),'private_reaction,action,reply');
   assert.ok(!item.response_format.json_schema.schema.properties.action.enum.includes('acknowledge_feeling'));
   assert.ok(p.includes('여울 씨'));
 }
});
test('the model must select its own action; no keyword classifier or predefined emotional answer',()=>{
 const a=compile('허전해요');
 const b=compile('밥 먹었어요?');
 assert.equal(a.hashes.system,b.hashes.system);
 assert.equal(a.response_format.json_schema.schema.properties.action.enum.includes('care_before_label'),true);
 assert.equal(a.response_format.json_schema.schema.properties.action.enum.includes('react_quickly'),true);
 assert.equal(a.response_format.json_schema.schema.properties.action.enum.includes('observe_reaction'),true);
});
test('source replacement, invented history and empty turns are rejected before provider request',()=>{
 assert.throws(()=>compile('허전해요',{runtimeMarkdown:runtime+'a'}),/RUNTIME_SOURCE_PIN/);
 assert.throws(()=>compile('허전해요',{relationshipStage:'attached'}),/RELATIONSHIP_UNSUPPORTED/);
 assert.throws(()=>compile(''),/USER_MOVE/);
 assert.throws(()=>compile('x'.repeat(1001)),/USER_MOVE/);
});
test('rejects counseling reflex and incorrect self-reference without rewriting or retry',()=>{
 const base={private_reaction:'왜 저렇게 말하는지 좀 궁금해요.',action:'react_quickly'};
 assert.deepEqual(assessYeoulEverydayVoiceV3({...base,reply:'그랬군요. 그런 날이 있죠.'}),
   {ok:false,reason:'GENERIC_EMPATHY_OPENING'});
 assert.deepEqual(assessYeoulEverydayVoiceV3({...base,reply:'그렇군요. 알겠어요.'}),
   {ok:false,reason:'GENERIC_EMPATHY_OPENING'});
 assert.deepEqual(assessYeoulEverydayVoiceV3({...base,reply:'저는 안 먹었어요. 여울 님은요?'}),
   {ok:false,reason:'SELF_ADDRESS_AS_USER'});
 assert.deepEqual(assessYeoulEverydayVoiceV3({...base,action:'acknowledge_feeling',reply:'왜 그래요?'}),
   {ok:false,reason:'INVALID_RESPONSE_SCHEMA'});
 assert.deepEqual(assessYeoulEverydayVoiceV3({...base,reply:'왜요, 무슨 일 있었어요?'}),
   {ok:true,reason:null});
});
