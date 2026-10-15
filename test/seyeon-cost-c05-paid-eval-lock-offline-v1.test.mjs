import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('COST-05 paid-evaluation change remains narrow',()=>{
  it('keeps entire legacy 5v3 paid dialogue workflow hard-locked',()=>{
    const source=readFileSync(new URL(
      '../.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml',import.meta.url),'utf8');
    const header=source.split(/^  compare:\s*$/m)[1]?.split(/^    steps:\s*$/m)[0]??'';
    expect(header.split(/\r?\n/u).some(line=>
      line.trim()==='if: $'+'{{ false }}')).toBe(true);
    expect(source).toContain('OPENAI_API_KEY');
  });
  it('refuses old 100/400-case runner and OPENAI_API_KEY in the one manual review workflow',()=>{
    const source=readFileSync(new URL(
      '../.github/workflows/seyeon-model-eval-v1.yml',import.meta.url),'utf8');
    expect(source).toContain('workflow_dispatch:');
    expect(source).not.toContain('run-seyeon-model-eval-v1.mjs');
    expect(source).not.toContain('secrets.OPENAI_API_KEY }}');
    expect(source).toContain('secrets.OPENAI_API_KEY2');
    expect(source).toContain('run-seyeon-cost-c06-eight-call-v1.mjs');
  });
});
