import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const newer='scripts/seyeon-c09-minimax-m2-her-remaining-four-paid-once-20261027.mjs';
const old='scripts/seyeon-c09-openrouter-minimax-m2-her-5x1-20261027.mjs';
const ref=JSON.parse(readFileSync('docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json','utf8'));
function run(args:string[]){
 return spawnSync(process.execPath,[resolve(newer),...args],{
  cwd:process.cwd(),encoding:'utf8',timeout:10000,
  env:{...process.env,OPENROUTER_API_KEY:''},
 });
}
describe('MiniMax five original questions, only remaining four after Q1',()=>{
 it('keeps the shared persona and the original four public questions unchanged',()=>{
  const out=run(['--dry-run']);expect(out.status).toBe(0);
  const r=JSON.parse(out.stdout);
  expect(r.mode).toBe('DRY_RUN_OFFLINE');
  expect(r.model).toBe('minimax/minimax-m2-her');
  expect(r.newProviderCalls).toBe(0);
  expect(r.priorQ1AlreadyAttempted).toBe(1);
  expect(r.priorQ1Status).toBe('TRUNCATED_NO_RETRY');
  expect(r.questionIds).toEqual([2,5,7,10]);
  expect(r.cases).toHaveLength(4);
  expect(r.maxNewCalls).toBe(4);
  expect(r.noRetries).toBe(true);
  expect(r.noFallback).toBe(true);
  expect(r.productionRoutingChanged).toBe(false);
  for(const q of r.cases){
   const original=ref.records.filter((x:{id:number})=>x.id===q.id);
   expect(original).toHaveLength(3);
   expect(original.every((x:{prompt:string})=>x.prompt===q.question)).toBe(true);
   expect(q.questionSha256).toBe(createHash('sha256').update(q.question,'utf8').digest('hex'));
  }
  const literal=(p:string)=>{
   const c=readFileSync(p,'utf8'),a=c.indexOf('const SYSTEM=['),z=c.indexOf("].join('\\n');",a);
   expect(a).toBeGreaterThanOrEqual(0);expect(z).toBeGreaterThan(a);
   return c.slice(a,z+12);
  };
  expect(literal(newer)).toBe(literal(old));
  const code=readFileSync(newer,'utf8');
  expect(code).toContain('temperature:0.65,max_tokens:MAX_OUTPUT_TOKENS');
  expect(code).toContain("const MAX_OUTPUT_TOKENS=900;");
  expect(code).toContain("const MAX_TOTAL_APPROVED_USD=0.03;");
  expect(code).toContain("const Q1_PRIOR_RECORDED_USD=0.0012381;");
 });
 it('blocks all incomplete commands and forbids existing unapproved retry paths',()=>{
  for(const args of [
   [],['--execute'],['--execute','--approved-minimax-her-five-20261027'],
   ['--execute','--approved-minimax-remaining-four-20261027'],
   ['--execute','--approved-minimax-remaining-four-20261027','--resume'],
   ['--execute','--approved-minimax-remaining-four-20261027','--limit','1'],
  ]){
   const r=run(args);
   expect(r.status).not.toBe(0);
   expect(r.stdout).not.toContain('PRECHECK');
  }
 });
});
