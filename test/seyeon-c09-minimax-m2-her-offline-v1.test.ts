import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const script='scripts/seyeon-c09-openrouter-minimax-m2-her-5x1-20261027.mjs';
const old='scripts/seyeon-c09-openrouter-gpt6-luna-5x1-20261026.mjs';
const reference=JSON.parse(readFileSync('docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json','utf8'));
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function run(args:string[]){
 return spawnSync(process.execPath,[resolve(script),...args],{
  cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,OPENROUTER_API_KEY:''}
 });
}
describe('MiniMax approved one-shot five public cases',()=>{
 it('uses exact original five questions and same literal shared persona as Luna/GLM',()=>{
  const result=run(['--dry-run']);expect(result.status).toBe(0);
  const report=JSON.parse(result.stdout);
  expect(report.dryRun).toBe(true);
  expect(report.noNetworkCalls).toBe(true);
  expect(report.questionIds).toEqual([1,2,5,7,10]);
  expect(report.modelIds).toEqual(['minimax/minimax-m2-her']);
  expect(report.matrixCount).toBe(5);
  for(const q of report.questions){
   const rows=reference.records.filter((x:{id:number})=>x.id===q.id);
   expect(rows.length).toBe(3);
   expect(rows.every((x:{prompt:string})=>x.prompt===q.prompt)).toBe(true);
   expect(q.sha).toBe(hash(q.prompt));
  }
  const extract=(path:string)=>{
   const s=readFileSync(path,'utf8');
   const start=s.indexOf('const SYSTEM=[');
   const end=s.indexOf("].join('\\n');",start);
   expect(start).toBeGreaterThanOrEqual(0);
   expect(end).toBeGreaterThan(start);
   return s.slice(start,end+12);
  };
  expect(extract(script)).toBe(extract(old));
 });
 it('requires explicit new approval and key before paid requests',()=>{
  for(const args of [
   [],['--execute'],['--execute','--approved-luna-five'],
   ['--execute','--approved-minimax-her-five-20261027'],
   ['--execute','--approved-minimax-her-five-20261027','--resume'],
   ['--execute','--approved-minimax-her-five-20261027','--limit','1']
  ]){
   const result=run(args);
   expect(result.status).not.toBe(0);
   expect(result.stdout).not.toContain('PRECHECK');
  }
 });
});
