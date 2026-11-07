import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source=readFileSync(new URL('../scripts/operations/character-chat/production-01-four-character-independent-release-open-20261106.sql',import.meta.url),'utf8');
const hub=readFileSync(new URL('../apps/web/chat-hub.js',import.meta.url),'utf8');

describe('Four non-Se-yeon Character chat-open independent release admission',()=>{
  it('keeps all six visible people and never removes Yunho from the public cards',()=>{
    expect(hub).toContain("key: 'yunho'");
    expect(hub).toContain("key !== 'seorin' && key !== 'mira' && key !== 'doyun'");
    expect(hub).not.toContain("key !== 'yunho'");
  });
  it('requires active, unique independently published Character authority rather than browser-created content',()=>{
    expect(source).toContain("p_character_id in ('baekheon','yeoul','rahyeon','taegyeom')");
    expect(source).toContain("and cr.is_default = false");
    expect(source).toContain("and crc.enabled is true");
    expect(source).toContain("and crc.availability = 'available'");
    expect(source).toContain("v_independent_release_count > 1");
    expect(source).toContain("member_character_thread_independent_release_ambiguous");
    expect(source).toContain("v_independent_release_count = 1");
    expect(source).toContain("if not v_character_published then");
    expect(source).toContain("v_character_published := found;");
    expect(source).toContain("if v_default_count <> 1 then");
  });
  it('admits the four independent releases through a narrow owner-only RLS slice, not by removing the default rule',()=>{
    const start=source.indexOf('create policy conversation_threads_chat_thread_open_independent_insert_v1');
    const end=source.indexOf('create or replace function public.cmd_open_member_single_character_thread_v1',start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const policy=source.slice(start,end);
    expect(policy).toContain('for insert');
    expect(policy).toContain('to myeongha_chat_thread_open_owner');
    expect(policy).toContain('subject_id = public.current_myeongha_subject_id()');
    expect(policy).toContain("cr.status = 'active'");
    expect(policy).toContain('cr.is_default = false');
    expect(policy).toContain("crc.character_id in ('baekheon','yeoul','rahyeon','taegyeom')");
    expect(policy).toContain('cb.retired_at is null');
    expect(policy).toContain('crc.enabled is true');
    expect(policy).toContain("crc.availability = 'available'");
    expect(policy).toContain('cr.id = active_content_release_id');
    expect(policy).toContain('cr.content_bundle_id = active_content_bundle_id');
    expect(source).not.toContain('drop policy if exists conversation_threads_chat_thread_open_insert_v1');
    expect(policy).not.toMatch(/\bgrant\s+(?:insert|all)\b/iu);
  });
  it('retains member-owned single thread, immutable pinned bundle, and least-privilege executor',()=>{
    expect(source).toContain("perform public.assert_myeongha_subject_context_v1(p_subject_id)");
    expect(source).toContain("where s.id = p_subject_id");
    expect(source).toContain("for update;");
    expect(source).toContain("v_existing_count > 1");
    expect(source).toContain("v_existing_participant_bundle_id is distinct from v_existing_bundle_id");
    expect(source).toContain("'myeongha_chat_thread_open_owner'");
    expect(source).toContain("not has_function_privilege('authenticated',p.oid,'EXECUTE')");
    expect(source).toContain("not has_function_privilege('anon',p.oid,'EXECUTE')");
    expect(source).not.toMatch(/\bgrant\s+execute\b/iu);
    expect(source.trimEnd()).toMatch(/commit;$/iu);
  });
});
