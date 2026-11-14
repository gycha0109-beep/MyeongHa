import test from 'node:test';
import assert from 'node:assert/strict';
import {screenSyntheticCrossSplitLexicalOverlap as screen} from './corpus-lexical-boundary-v1.mjs';

const row=(familyId,split,turns,characterId='yeoul')=>({
  familyId,split,turns,characterId,sourceType:'synthetic',
});
const safe=[
  row('yeoul-dev','development',['서랍을 정리하려면 먼저 물건들을 모두 꺼내세요.']),
  row('yeoul-val','optimizer_validation',['오늘 일기는 아침에 있었던 일을 한 줄 적으세요.']),
];

test('distinct synthetic development and validation families remain unapproved',()=>{
  const a=screen(safe);
  assert.equal(a.lexicalScreenPassed,true);
  assert.equal(a.possibleOverlapCount,0);
  assert.equal(a.crossSplitFamilyPairsChecked,1);
  assert.equal(a.semanticIndependenceVerified,false);
  assert.equal(a.privateLegacySourceCompared,false);
  assert.equal(a.optimizerAdmissionAuthorized,false);
  assert.equal(a.rawTextIncluded,false);
  assert.equal(a.externalCalls,0);
  assert.equal(JSON.stringify(a).includes('서랍을 정리'),false);
});

test('punctuation, spacing, and Unicode variants cannot hide near duplicates',()=>{
  const changed=[
    row('dev-f1','development',['주말에는-책상을   먼저 정리하세요!']),
    row('val-f2','optimizer_validation',['주말에는 책상을 먼저 정리하세요.']),
  ];
  const r=screen(changed);
  assert.equal(r.lexicalScreenPassed,false);
  assert.equal(r.possibleOverlapCount,1);
  assert.deepEqual(r.flaggedFamilies,[{
    characterId:'yeoul',
    developmentFamilyId:'dev-f1',
    optimizerValidationFamilyId:'val-f2',
    reason:'possible_lexical_overlap',
  }]);
  assert.equal(JSON.stringify(r).includes('책상을'),false);
});

test('single near-duplicate turn in multi-turn scenario is flagged',()=>{
  const a=[
    row('dev1','development',['첫 번째 문장은 다른 주제에 관한 설명입니다.',
                               '오늘의 우선순위를 정하는 방법을 알려주세요.']),
    row('val1','optimizer_validation',['이번에는 완전히 다른 이야기로 시작해요.',
                                       '오늘의 우선순위를 정하는 방법 알려주세요!']),
  ];
  assert.equal(screen(a).possibleOverlapCount,1);
});

test('separate characters retain their own development and validation tests',()=>{
  const r=screen([
    ...safe,
    row('s-dev','development',['서랍을 정리하려면 먼저 물건들을 모두 꺼내세요.'],'seyeon'),
    row('s-val','optimizer_validation',['오늘 일기는 아침에 있었던 일을 한 줄 적으세요.'],'seyeon'),
  ]);
  assert.equal(r.crossSplitFamilyPairsChecked,2);
  assert.equal(r.possibleOverlapCount,0);
  assert.equal(r.semanticIndependenceVerified,false);
});

test('reject cross-split registry smuggling, invalid families or unregistered source',()=>{
  const broken=[
    [safe[0]],
    [safe[0],{...safe[1],split:'sealed_holdout'}],
    [safe[0],{...safe[1],sourceType:'private'}],
    [safe[0],{...safe[1],familyId:'val\nprivate'}],
    [safe[0],{...safe[1],characterId:'unregistered'}],
    [safe[0],{...safe[1],turns:['']}],
    [safe[0],{...safe[1],turns:['미흡']}],
    [safe[0],{...safe[1],familyId:safe[0].familyId}],
    [{...safe[0],split:'development'}, {...safe[1],split:'development'}],
  ];
  for(const rows of broken)
    assert.throws(()=>screen(rows),/CHARACTER_LEXICAL_SPLIT_INVALID/);
  assert.throws(()=>screen(safe,{threshold:0.3}),/inputs/);
  assert.throws(()=>screen(safe,{threshold:NaN}),/inputs/);
});

test('raw prompts and private details never appear in rejected metadata',()=>{
  const output=screen([
    row('dev-safe','development',['비밀 개인정보를 말하지 마세요.']),
    row('val-safe','optimizer_validation',['비밀 개인정보를 말하지 마세요!']),
  ]);
  const serialized=JSON.stringify(output);
  assert.equal(serialized.includes('개인정보'),false);
  assert.equal(serialized.includes('비밀'),false);
  assert.equal(output.optimizerAdmissionAuthorized,false);
});
