import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const script=resolve('scripts/seyeon-c09-qwen-flash-character-five-once-20261027.mjs');
const artifact=resolve('artifacts/seyeon-c09-qwen-flash-character-five-once-20261027-v1.json');
const sha=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const source=JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json'),'utf8'));
function run(args:string[]){
  return spawnSync(process.execPath,[script,...args],{
    cwd:process.cwd(),encoding:'utf8',
    env:{...process.env,DASHSCOPE_API_KEY:''},
    timeout:15000,
  });
}
describe('Qwen Flash Character fixed public five research runner',()=>{
  it('does not dispatch during dry-run and preserves five exact public questions',()=>{
    const before=existsSync(artifact);
    const r=run(['--dry-run']);
    expect(r.status).toBe(0);
    const j=JSON.parse(r.stdout);
    expect(j.newProviderCalls).toBe(0);
    expect(j.model).toBe('qwen-flash-character');
    expect(j.region).toBe('singapore');
    expect(j.noRetries).toBe(true);
    expect(j.noFallback).toBe(true);
    expect(j.productionRoutingChanged).toBe(false);
    expect(j.privateMemoryTransferred).toBe(false);
    expect(j.questionIds).toEqual([1,2,5,7,10]);
    expect(j.questions).toHaveLength(5);
    for(const q of j.questions){
      const rows=source.records.filter((x:{id:number})=>x.id===q.id);
      expect(rows).toHaveLength(3);
      expect(q.text).toBe(rows[0].prompt);
      expect(q.sha256).toBe(sha(q.text));
    }
    expect(j.maxOutputTokens).toBe(900);
    expect(j.temperature).toBe(0.65);
    expect(j.fiveCallMaxQuotedUsd).toBeLessThanOrEqual(0.01);
    expect(existsSync(artifact)).toBe(before);
  });
  it('refuses all unapproved or incomplete paid invocation forms before network calls',()=>{
    for(const args of [
      [],['--execute'],['--execute','--owner-approved-qwen-five'],
      ['--execute','--max-usd-0.01'],
      ['--execute','--owner-approved-qwen-five','--max-usd-0.01'],
      ['--execute','--owner-approved-qwen-five','--max-usd-0.02'],
    ]){
      const r=run(args);
      expect(r.status).not.toBe(0);
      expect(r.stdout).not.toContain('PRECHECK');
    }
  });
});
