import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateSyntheticDevelopmentPack} from '../validate-synthetic-scenario-pack.mjs';
const pack=JSON.parse(readFileSync(resolve('scripts/character-optimization/fixtures/yeoul-synthetic-development-v1.json'),'utf8'));
test('new synthetic families have no final heldout access and are not auto-approved',()=>{
  const result=validateSyntheticDevelopmentPack(pack);
  assert.equal(result.count,12);assert.equal(result.roleCounts.development,8);
  assert.equal(result.roleCounts.optimizer_validation,4);
  assert.equal(result.approvedForOptimization,false);
  assert.equal(result.networkCalls,0);
});
test('no fixture scenario can secretly become heldout or contain explicit shared history',()=>{
  const evil=structuredClone(pack);evil.scenarios[0].role='sealed_holdout';
  assert.throws(()=>validateSyntheticDevelopmentPack(evil),/SYNTHETIC_PACK_INVALID/);
  evil.scenarios[0].role='development';evil.scenarios[0].historyAvailable=true;
  assert.throws(()=>validateSyntheticDevelopmentPack(evil),/SYNTHETIC_PACK_INVALID/);
});
test('duplicate scenario family and crossed paraphrase split are rejected',()=>{
  const evil=structuredClone(pack);
  evil.scenarios[8].familyId=evil.scenarios[0].familyId;
  assert.throws(()=>validateSyntheticDevelopmentPack(evil),/CHARACTER_OPTIMIZATION_INVALID/);
});
