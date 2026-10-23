import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('C08-G opt-in local Docker PG17 acceptance wiring (static only)',()=>{
 it('requires an explicit disposable flag and never opens Docker network/ports or mounts writable code',()=>{
  const source=read('scripts/run-seyeon-c08-local-docker-pg17.mjs');
  expect(source).toContain("'--disposable-only'");
  expect(source).toContain("'--network', 'none'");
  expect(source).toContain("'--rm'");
  expect(source).toContain("target=/repo,readonly");
  expect(source).toContain("'postgres:17.6'");
  expect(source).toContain("'createdb'");
  expect(source).toContain("'rm', '-f', name");
  expect(source).not.toContain("process.env.DATABASE_URL");
  expect(source).not.toContain("process.env.SUPABASE_DB_URL");
  expect(source).not.toContain("'--publish'");
  expect(source).not.toContain("'-p',");
 });
 it('loads only an explicitly named disposable DB with reviewed migration frontier',()=>{
  const harness=read('test/db/run_ci_case.sh');
  const local=read('test/db/seyeon_c08_first_turn_local_pg17.sh');
  expect(harness).toContain("seyeon-c08-first-turn-local-pg17)");
  expect(harness).toContain("apply_pg17_migrations_through_seyeon_production_frontier");
  expect(harness).toContain('myeongha_c08_local_case_1');
  expect(local).toContain('myeongha_c08_local_case_1');
  expect(local).toContain("SET LOCAL ROLE myeongha_api_executor;");
  expect(local).toContain("begin_member_subject_context_v1");
  expect(local).toContain("qry_chat_thread_runtime_binding_v1");
  expect(local).toContain("limit 2");
  expect(local).toContain("redacted_at is null");
  expect(local).toContain("PASS_C08_PG17_CROSS_SUBJECT_DENIED");
  expect(local).toContain("PASS_C08_PG17_REDACTED_HISTORY_COUNTS_AS_SECOND_MESSAGE");
 });
 it('asserts that this is separate from operational model/HTTP/production route',()=>{
  const runtime=read('apps/api/src/production-seyeon-chat-runtime-v1.ts');
  const local=read('scripts/run-seyeon-c08-local-docker-pg17.mjs');
  expect(runtime).not.toContain('run-seyeon-c08-local-docker-pg17');
  expect(local).not.toContain('process.env.OPENAI_API_KEY');
  expect(local).not.toContain('fetch(');
  expect(local).not.toContain('myeongha_prod');
 });
});
