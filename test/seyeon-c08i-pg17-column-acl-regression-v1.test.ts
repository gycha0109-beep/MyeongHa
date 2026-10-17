import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('C08-I: PG17 actual least-privilege census admission matches migration 0950', () => {
  it('requires the exact owner policy, enabled RLS, a non-bypass executor and required SELECT columns', () => {
    const script = source('test/db/seyeon_c08_first_turn_local_pg17.sh');
    const migration = source('supabase/migrations/0950_chat_read_runtime_authority.sql');
    const shadow = source('apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.ts');

    expect(migration).toContain('conversation_messages_api_current_select_v1');
    expect(migration).toContain('alter table public.conversation_messages enable row level security');
    expect(migration).toMatch(/grant select \(\s*id,\s*thread_id,\s*subject_id,\s*sequence_no,\s*sender_type,/);
    expect(migration).toContain('on public.conversation_messages to myeongha_api_executor;');
    expect(script).toContain('pg_catalog.pg_policies');
    expect(script).toContain('conversation_messages_api_current_select_v1');
    expect(script).toContain('p.qual like');
    expect(script).toContain('not r.rolbypassrls');
    expect(script).toContain('not r.rolsuper');
    expect(script).toContain('pg_catalog.has_column_privilege(');
    for (const col of ['id', 'thread_id', 'subject_id', 'sequence_no', 'sender_type', 'redacted_at']) {
      expect(script).toContain("'" + col + "'");
      expect(shadow).toContain('m.' + col);
    }
    // Full-table SELECT was the user-reported false negative. Never demand it
    // or compensate by issuing a new broad GRANT.
    expect(script).not.toContain("has_table_privilege('myeongha_api_executor'");
    expect(script).not.toContain('GRANT SELECT ON public.conversation_messages');
    expect(script).toContain('HOLD_C08_PG17_ROLE_RLS_PRIVILEGE_CONTRACT');
    expect(script).toContain('C08_ACL_DIAGNOSTIC');
    expect(script).toContain('PASS_C08_PG17_OWNER_RLS_COLUMN_ACL_FUNCTION_AND_BROWSER_DENIAL');
  });

  it('denies browser function and table reads, and never changes the production route', () => {
    const script = source('test/db/seyeon_c08_first_turn_local_pg17.sh');
    const production = source('apps/api/src/production-seyeon-chat-runtime-v1.ts');
    expect(script).toContain("not pg_catalog.has_function_privilege(");
    expect(script).toContain("'anon','public.qry_chat_thread_runtime_binding_v1(uuid,uuid)','EXECUTE'");
    expect(script).toContain("not pg_catalog.has_table_privilege(");
    expect(script).toContain("'anon','public.conversation_messages','SELECT'");
    expect(script).toContain("'myeongha_api_executor'");
    expect(script).toContain('SET LOCAL ROLE myeongha_api_executor');
    expect(script).toContain('myeongha_c08_local_case_1');
    expect(production).not.toContain('seyeon_c08_first_turn_local_pg17');
  });
});
