import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/1308_character_production_turn_runtime_authority.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Character Production turn runtime authority migration', () => {
  it('reuses the existing Chat state machine instead of defining a parallel lifecycle', () => {
    expect(sql).toContain('cmd_allocate_chat_turn_attempt_v1');
    expect(sql).toContain('cmd_mark_chat_turn_context_ready_v1');
    expect(sql).toContain('cmd_mark_chat_turn_failed_v1');
    expect(sql).toContain('cmd_mark_chat_turn_generated_v1');
    expect(sql).toContain('cmd_validate_chat_turn_attempt_v1');
    expect(sql).toContain('cmd_commit_chat_turn_v1');
    expect(sql).not.toContain('create table public.character_production_turn');
  });

  it('binds every exposed wrapper to the canonical transaction subject', () => {
    expect(sql.match(/perform public\.assert_myeongha_subject_context_v1\(p_subject_id\);/gu))
      .toHaveLength(7);
    expect(sql).toContain('security definer');
    expect(sql).toContain('myeongha_character_turn_owner');
    expect(sql).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
    expect(sql).toContain('NOBYPASSRLS');
  });

  it('keeps direct Production DML away from the ordinary API executor', () => {
    expect(sql).toContain(
      "has_table_privilege(\n       'myeongha_api_executor', 'public.chat_turns', 'UPDATE'",
    );
    expect(sql).toContain(
      "has_table_privilege(\n       'myeongha_api_executor', 'public.ai_execution_logs', 'INSERT'",
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select,\s*)?insert\s+on\s+public\.ai_execution_logs\s+to\s+myeongha_api_executor/iu,
    );
    expect(sql).not.toMatch(
      /grant\s+update[\s\S]{0,200}public\.chat_turns\s+to\s+myeongha_api_executor/iu,
    );
  });

  it('pins renderer and Output Guard provenance to the exact generated hash', () => {
    expect(sql).toContain("'renderer', p_provider, p_model, p_prompt_version");
    expect(sql).toContain("'generatedContentHash', p_content_hash");
    expect(sql).toContain("'output_guard', 'myeongha_internal', p_output_guard_version");
    expect(sql).toContain('v_generated_hash is distinct from p_expected_content_hash');
    expect(sql).toContain('cmd_chat_validate_ai_provenance_conflict');
  });

  it('links only existing Reading grounding rows and never synthesizes a grounding', () => {
    expect(sql).toContain('from public.reading_groundings g');
    expect(sql).toContain('where g.reading_id = p_reading_id');
    expect(sql).toContain("coalesce(\n    jsonb_agg(to_jsonb(g.id::text) order by g.id::text),\n    '[]'::jsonb");
    expect(sql).not.toContain('insert into public.reading_groundings');
  });

  it('commits no relationship, world, or memory mutation from raw renderer proposals', () => {
    expect(sql).toContain(
      "from public.cmd_commit_chat_turn_v1(\n    p_subject_id,\n    p_thread_id,\n    p_turn_id,\n    p_attempt_id,\n    p_message_id,\n    p_outbox_event_id,\n    null,\n    null,\n    null",
    );
    expect(sql).not.toContain('insert into public.relationship_events');
    expect(sql).not.toContain('insert into public.memory_items');
    expect(sql).not.toContain('insert into public.life_facts');
  });

  it('exposes only the narrow runtime wrappers to myeongha_api_executor', () => {
    expect(sql).toContain(
      'grant execute on function public.qry_character_production_committed_turn_runtime_v1',
    );
    expect(sql).toContain(
      'grant execute on function public.cmd_character_production_stage_generated_runtime_v1',
    );
    expect(sql).toContain(
      'grant execute on function public.cmd_character_production_validate_runtime_v1',
    );
    expect(sql).toContain(
      'grant execute on function public.cmd_character_production_commit_runtime_v1',
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.cmd_commit_chat_turn_v1[\s\S]{0,120}to\s+myeongha_api_executor/iu,
    );
  });
});
