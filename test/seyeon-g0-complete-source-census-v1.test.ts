// Watchtower-Track: security
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = (name: string) => readFileSync(
  new URL('../scripts/operations/seyeon-security-s0/' + name, import.meta.url),
  'utf8',
);

describe('G0 source completeness before any historical text release', () => {
  it('counts redacted, empty and missing original messages before history authorization', () => {
    const source = sql('13-g0-current-original-lineage-context.sql');
    const window = source.split('create function public.qry_seyeon_g0_current_source_recent_messages_v1(')[1];
    expect(window).toBeDefined();
    expect(window).toContain('src.thread_id,src.sequence_no,src.content_hash,src.redacted_at,');
    expect(window).toContain("nullif(btrim(src.body_text),'') is not null as has_body");
    expect(window).not.toContain('and src.redacted_at is null and src.body_text is not null');
    expect(window).toContain('v_row.redacted_at is not null or v_row.has_body is distinct from true');
    expect(window).toContain("constraint='seyeon_g0_context_window_source_missing'");
    expect(window).toContain('if v_returned<>v_total then');
  });

  it('a historical Assistant cannot outlive its DB-original User prompt', () => {
    const g0 = sql('13-g0-current-original-lineage-context.sql');
    const original = g0.split(
      'create function seyeon_private.assert_current_original_assistant_lineage_v1(',
    )[1]?.split('-- Read a whole model-context window')[0] ?? '';
    expect(original).toContain("v_pin->>'currentUserMessageId'");
    expect(original).toContain("v_pin->>'currentUserTextDigest'");
    expect(original).toContain("constraint='seyeon_g0_assistant_original_user_missing'");
    expect(original).toContain("constraint='seyeon_g0_assistant_original_user_changed'");
    expect(original).toContain('v_user_count<>1');
    expect(original).toContain('for share of um;');
    expect(original).toContain("sha256:wire-utf8:v1:");
    const g2 = sql('02-atomic-commit.sql');
    expect(g2).toContain("v_positive ->> 'currentUserMessageId'");
    expect(g2).toContain("v_positive ->> 'currentUserTextDigest'");
    expect(g2).toContain('for share of msg;');
    const replay = sql('19-first-original-assistant-replay.sql');
    expect(replay).toContain(
      'perform seyeon_private.assert_current_original_assistant_lineage_v1(',
    );
    const relation = sql('21-relationship-origin-completeness.sql');
    expect(relation).toContain(
      'perform seyeon_private.assert_current_original_assistant_lineage_v1(',
    );
  });

  it('rejects a derived relationship event if any original message reference fails to resolve', () => {
    const source = sql('21-relationship-origin-completeness.sql');
    expect(source).toContain('v_resolved_source_count:=0;');
    expect(source).toContain('v_resolved_source_count:=v_resolved_source_count+1;');
    expect(source).toContain('if v_resolved_source_count<>v_message_count then');
    expect(source).toContain("where p.ref_kind='source_message' and p.source_message_id is not null");
    expect(source).toContain("count(distinct p.source_message_id)");
    expect(source).toContain("count(distinct p.ordinal)");
    expect(source).toContain('v_all_ref_count<>v_message_count');
    expect(source).toContain('v_distinct_message_count<>v_message_count');
    expect(source).toContain('v_distinct_ordinal_count<>v_message_count');
    expect(source).toContain("constraint='seyeon_g0_relationship_origin_census_mismatch'");
    expect(source).toContain('perform seyeon_private.assert_current_original_member_user_message_v1(');
    expect(source).toContain('perform seyeon_private.assert_current_original_assistant_lineage_v1(');
  });
});
