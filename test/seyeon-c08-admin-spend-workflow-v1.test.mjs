// Watchtower-Track: character-memory
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL(
 '../.github/workflows/seyeon-c08-admin-spend-readiness-v1.yml',
 import.meta.url),'utf8');
const verifier=readFileSync(new URL(
 '../scripts/seyeon-c08-admin-spend-readiness-v1.mjs',
 import.meta.url),'utf8');

describe('C08 Admin spend preflight workflow is read-only and locked',()=>{
 it('permits a manual main-only run with a separate admin secret',()=>{
  expect(workflow).toContain('on:\\n  workflow_dispatch:'.replace('\\n','\n'));
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
  expect(workflow).toContain('permissions:\\n  contents: read'.replace('\\n','\n'));
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain('persist-credentials: false');
  expect(workflow).toContain('secrets.OPENAI_ADMIN_KEY');
  expect(workflow).toContain('vars.OPENAI_EVAL_PROJECT_ID');
  expect(workflow).not.toContain('secrets.OPENAI_EVAL_API_KEY');
  expect(workflow).not.toContain('secrets.OPENAI_API_KEY2');
  expect(workflow).not.toContain('secrets.OPENAI_API_KEY');
  expect(workflow).not.toMatch(/^  push:|^  pull_request:/m);
 });
 it('executes GET-only diagnostics without unlocking paid requests',()=>{
  expect(workflow).toContain('node scripts/seyeon-c08-admin-spend-readiness-v1.mjs');
  expect(verifier).toContain("method:'GET'");
  expect(verifier).not.toContain("method:'POST'");
  expect(verifier).not.toContain('/v1/responses');
  expect(verifier).toContain('paidDispatchEnabled:false');
 });
});
