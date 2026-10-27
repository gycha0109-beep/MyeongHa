import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {
 buildSeyeonC09LunaAgencyFiveCaseShadowV1,
} from '../apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.js';

const runner='scripts/seyeon-c09-three-model-improved-prompt-parity-offline-v1.mjs';
const original=JSON.parse(readFileSync(
 'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json','utf8'));
const basic=JSON.parse(readFileSync(
 'docs/experiments/seyeon-c09-three-model-minimax-luna-glm-five-20261027-raw-v1.json','utf8'));
const models=['openai/gpt-6-luna','z-ai/glm-5.3-flash','minimax/minimax-m2-her'];
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');

describe('C09 three-model improved persona parity: offline only',()=>{
 it('reuses exact five human-selected action/motive plans and no real authority',()=>{
  const plans=buildSeyeonC09LunaAgencyFiveCaseShadowV1();
  expect(plans.map(p=>p.caseId)).toEqual([1,2,5,7,10]);
  const pairs=plans.flatMap(p=>models.map(model=>({
   model,id:p.caseId,question:p.messages[1]!.content,
   systemHash:hash(p.messages[0]!.content),
   planSource:p.behaviorPlanSource,
  })));
  expect(pairs).toHaveLength(15);
  expect(basic.modelComparison).toEqual(models);
  for(const p of plans){
   const originals=original.records.filter((x:{id:number})=>x.id===p.caseId);
   expect(originals).toHaveLength(3);
   expect(originals.every((x:{prompt:string})=>x.prompt===p.messages[1]!.content)).toBe(true);
   expect(basic.records.find((x:{id:number})=>x.id===p.caseId)?.question)
    .toBe(p.messages[1]!.content);
   expect(new Set(pairs.filter(q=>q.id===p.caseId).map(q=>q.systemHash)).size).toBe(1);
   expect(p.behaviorPlanSource).toBe('HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS');
   expect(p.productionRoutingAuthorized).toBe(false);
   expect(p.providerCallExecuted).toBe(false);
   expect(p.ownerMemoryPermissionVerified).toBe(false);
   expect(p.independentlyReviewed).toBe(false);
   expect(p.factualAuthorityGrantedByModel).toBe(false);
  }
 });
 it('blocks execute, paid, resume and extra CLI flags before provider dispatch',()=>{
  const source=readFileSync(runner,'utf8');
  expect(source).not.toContain('await fetch(');
  expect(source).not.toContain('OPENROUTER_API_KEY');
  expect(source).toContain('OFFLINE_ONLY_NO_PROVIDER_DISPATCH');
  for(const args of [['--execute'],['--paid'],['--resume'],[],['--dry-run','--execute']]){
   const result=spawnSync(process.execPath,[resolve(runner),...args],{
    encoding:'utf8',cwd:process.cwd(),timeout:10000,
   });
   expect(result.status).not.toBe(0);
   expect(result.stdout).not.toContain('PRECHECK');
  }
 });
});
