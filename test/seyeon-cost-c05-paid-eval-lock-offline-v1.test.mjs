import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// COST-05 negative guard only. Never dispatch a workflow or access paid credentials.
const protectedWorkflows=[
  'seyeon-dialogue-path-real-api-eval-v1.yml',
  'seyeon-model-eval-v1.yml',
];
describe('COST-05 paid-model cost-incident holds',()=>{
  for(const name of protectedWorkflows){
    it(name+' preserves an executable compare-job false guard',()=>{
      const source=readFileSync(new URL('../.github/workflows/'+name,import.meta.url),'utf8');
      const jobHeader=source.split(/^  compare:\s*$/m)[1]?.split(/^    steps:\s*$/m)[0]??'';
      expect(jobHeader).toBeTruthy();
      const disabled='if: $'+'{{ false }}';
      expect(jobHeader.split(/\r?\n/u).some(line=>line.trim()===disabled)).toBe(true);
      expect(source).toContain('OPENAI_API_KEY');
    });
  }
});
