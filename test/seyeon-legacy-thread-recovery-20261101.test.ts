import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/production-owner-seyeon-archive-legacy-thread-20261101.sql',
  import.meta.url,
),'utf8').replace(/\r\n/g,'\n');
const open=readFileSync(new URL(
  '../supabase/migrations/0970_member_character_thread_open_runtime_authority.sql',
  import.meta.url,
),'utf8');

describe('one-time legacy Se-yeon owner conversation recovery',()=>{
  it('requires an exact owner, active thread, single Character and bounded failed-turn census',()=>{
    expect(sql).toContain('if v_owner_count<>1');
    expect(sql).toContain('if v_active_count<>1');
    expect(sql).toContain('if v_old_failed_count<>1');
    expect(sql).toContain("c.character_id='seyeon'");
    expect(sql).toContain("c.role='primary'");
    expect(sql).toContain('v_other_active_count<>0');
    expect(sql).toContain('for update of s');
    expect(sql).toContain('for update of t');
  });
  it('never destroys chat history or alters pending payment/receipts',()=>{
    expect(sql).toContain('seyeon_positive_delivery_issued_at');
    expect(sql).toContain('seyeon_positive_delivery_received_at');
    expect(sql).toContain("e.lifecycle_state<>'settled'");
    expect(sql).toContain('v_before_messages');
    expect(sql).toContain('v_before_turns');
    expect(sql).toContain('v_before_attempts');
    expect(sql).toContain("set status='archived'");
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\./i);
    expect(sql).not.toMatch(/\btruncate\s+public\./i);
    expect(sql).not.toMatch(/\bupdate\s+public\.(?:chat_turns|conversation_messages|chat_turn_attempts|seyeon_ai_call_cost_events)\b/i);
  });
  it('existing Member open command reuses only an active thread, otherwise creates a new one',()=>{
    expect(open).toContain("and ct.status = 'active'");
    expect(open).toContain('if v_existing_count = 1 then');
    expect(open).toContain('insert into public.conversation_threads (');
    expect(open).toContain("    'single_character',");
    expect(open).toContain("    'active',");
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
