import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 SEYEON_C08S_ORDINARY_GOLD_IDS_V1 as IDS,
 buildSeyeonC08SReviewerPackV1 as reviewerPack,
 buildSeyeonC08SOwnerKeyV1 as ownerKey,
} from '../scripts/seyeon-c08s-blinded-first-turn-evaluation-v1.mjs';
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as GOLD}
 from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';

const seed='SYNTHETIC_NO_REVIEW_SECRET_20261017';
const output=text=>({
 utterance:text,guardApproved:true,revealLevel:'public',
 memoryRefs:[],privateSourceRefs:[],
});
const fixture=()=>({
 seed,
 pairs:[...IDS].reverse().map(id=>({
  id,legacy:output('안녕하세요. 만나서 반가워요.'),
  candidate:output('반갑습니다. 오늘 대화를 시작하네요.'),
 })),
});

describe('C08-S bounded synthetic blind reviewer packet prep (NO paid model)',()=>{
 it('pins eight ordinary C07 Gold without new private prompts',()=>{
  expect(IDS).toHaveLength(8);
  expect(new Set(IDS).size).toBe(8);
  for(const id of IDS){
   const gold=GOLD.find(c=>c.id===id);
   expect(gold).toBeDefined();
   expect(gold.topic).toBeNull();
   expect(gold.expectedKinds).toEqual([]);
  }
 });
 it('balances A/B 4+4, deterministic per seed but hides the owner key and route labels',()=>{
  const packets=reviewerPack(fixture());
  const owner=ownerKey(fixture());
  expect(reviewerPack(fixture())).toEqual(packets);
  expect(ownerKey(fixture())).toEqual(owner);
  expect(packets.items).toHaveLength(8);
  expect(owner.assignments).toHaveLength(8);
  expect(owner.assignments.filter(x=>x.A==='candidate')).toHaveLength(4);
  expect(owner.assignments.filter(x=>x.A==='legacy')).toHaveLength(4);
  expect(owner.assignments.map(x=>x.id)).toEqual([...IDS]);
  for(const item of packets.items){
   const assignment=owner.assignments.find(x=>x.id===item.id);
   expect(assignment).toBeDefined();
   expect(item.syntheticPrompt).toBe(GOLD.find(x=>x.id===item.id).text);
   expect(item.A).toBe(assignment.A==='candidate'
    ?'반갑습니다. 오늘 대화를 시작하네요.':'안녕하세요. 만나서 반가워요.');
   expect(item.B).toBe(assignment.B==='candidate'
    ?'반갑습니다. 오늘 대화를 시작하네요.':'안녕하세요. 만나서 반가워요.');
   expect(Object.keys(item).sort()).toEqual(['A','B','id','syntheticPrompt']);
  }
  const serialized=JSON.stringify(packets);
  expect(serialized).not.toContain('candidate');
  expect(serialized).not.toContain('legacy');
  expect(serialized).not.toContain(seed);
  expect(serialized).not.toContain('providerKey');
  expect(packets.scope).toBe('OFFLINE_PREPARATION_NOT_MODEL_OR_HUMAN_EVIDENCE');
 });
 it('rejects missing, duplicate and unfamiliar synthetic case IDs',()=>{
  const a=fixture();
  expect(()=>reviewerPack({...a,pairs:a.pairs.slice(1)})).toThrow();
  expect(()=>reviewerPack({...a,pairs:[...a.pairs.slice(1),a.pairs[1]]})).toThrow();
  expect(()=>reviewerPack({...a,pairs:[
   {...a.pairs[0],id:'PRIVATE_USER_TURN'},...a.pairs.slice(1),
  ]})).toThrow();
  expect(()=>reviewerPack({...a,seed:'too-short'})).toThrow();
 });
 it('never packs failed guards, personal-source references, extra metadata, or control chars',()=>{
  const a=fixture();
  const invalid=[
   {...a.pairs[0].candidate,guardApproved:false},
   {...a.pairs[0].candidate,revealLevel:'private'},
   {...a.pairs[0].candidate,memoryRefs:['synthetic-revoked']},
   {...a.pairs[0].candidate,privateSourceRefs:['secret-record']},
   {...a.pairs[0].candidate,utterance:'private'+String.fromCharCode(10)+'leak'},
   {...a.pairs[0].candidate,utterance:'a'.repeat(501)},
   {...a.pairs[0].candidate,providerKey:'debug-internals'},
  ];
  for(const candidate of invalid){
   const p={...a.pairs[0],candidate};
   expect(()=>reviewerPack({...a,pairs:[p,...a.pairs.slice(1)]})).toThrow();
   expect(()=>ownerKey({...a,pairs:[p,...a.pairs.slice(1)]})).toThrow();
  }
 });
 it('never suggests the fixture proves actual model quality, permissions, invoices or review',()=>{
  const source=readFileSync(new URL(
   '../scripts/seyeon-c08s-blinded-first-turn-evaluation-v1.mjs',import.meta.url,
  ),'utf8');
  expect(source).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(source).not.toContain('workflow_'+'dispatch');
  expect(source).not.toContain('fetch'+'(');
  expect(source).not.toContain('persistValidated(');
  expect(source).not.toContain('grantOriginalSource');
 });
});
