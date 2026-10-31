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

  it('rejects a derived relationship event if any original message reference fails to resolve', () => {
    const source = sql('21-relationship-origin-completeness.sql');
    expect(source).toContain('v_resolved_source_count:=0;');
    expect(source).toContain('v_resolved_source_count:=v_resolved_source_count+1;');
    expect(source).toContain('if v_resolved_source_count<>v_message_count then');
    expect(source).toContain("constraint='seyeon_g0_relationship_origin_census_mismatch'");
    expect(source).toContain('perform seyeon_private.assert_current_original_member_user_message_v1(');
    expect(source).toContain('perform seyeon_private.assert_current_original_assistant_lineage_v1(');
  });
});
