import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import { selectSeyeonExactModelPersonalSourcesV1 } from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';

const migration = readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/production-19-zero-source-verified-history-pin-20261101.sql',
  import.meta.url,
), 'utf8');
const hash = (value: unknown) => 'sha256:v1:' +
  createHash('sha256').update(canonicalJson(value)).digest('hex');

const messages = [
  { messageId: '11111111-1111-4111-8111-111111111111', role: 'user' as const, text: '안녕하세요' },
  { messageId: '22222222-2222-4222-8222-222222222222', role: 'assistant' as const, text: '반가워요.' },
  { messageId: '33333333-3333-4333-8333-333333333333', role: 'user' as const, text: '다시 왔어요' },
];

describe('Se-yeon 12-key exact recent-model source closure', () => {
  it('includes the committed previous User and Character turns in the source census', () => {
    const selection = selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories: [], sourceCandidates: [], requiredPersonalRecordCount: 0,
      recentMessages: messages, currentUserMessageId: messages[2]!.messageId,
    });
    expect(selection.selectedCurrentUserSource).toMatchObject({
      messageId: messages[2]!.messageId,
      role: 'user', selectedModelMessageDigest: hash(messages[2]),
    });
    expect(selection.selectedUnpinnedRecentSources.map(source => ({
      messageId: source.messageId,
      role: source.role,
      selectedModelMessageDigest: source.selectedModelMessageDigest,
    }))).toEqual(messages.slice(0, 2).map(message => ({
      messageId: message.messageId,
      role: message.role,
      selectedModelMessageDigest: hash(message),
    })));
    expect(selection.selectedModelSourceCensusDigest).toBe(hash({
      originalPersonalSources: [],
      currentUserSource: selection.selectedCurrentUserSource,
      unpinnedRecentSources: selection.selectedUnpinnedRecentSources,
      unpinnedDerivedSources: [],
    }));
  });

  it('preserves precise source closure after the runtime recent-message cap', () => {
    const selection = selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories: [], sourceCandidates: [], requiredPersonalRecordCount: 0,
      recentMessages: messages, maxRecentMessages: 2,
      currentUserMessageId: messages[2]!.messageId,
    });
    expect(selection.selectedUnpinnedRecentSources.map(source => source.messageId))
      .toEqual([messages[1]!.messageId]);
  });

  it('validates the DB message tail and zero-Personal original assistant lineage rather than trusting model refs', () => {
    expect(migration).toContain("v_selection_keys <> 12");
    expect(migration).toContain("jsonb_array_length(v_selection -> 'selectedUnpinnedRecentSources') > 23");
    expect(migration).toContain('limit (v_history_count+1)');
    expect(migration).toContain('v_window_ids[v_history_count+1] is distinct from v_current_id');
    expect(migration).toContain('v_item->>\'messageId\' is distinct from v_window_ids[v_i+1]');
    expect(migration).toContain("m.subject_id=p_subject_id and m.thread_id=v_thread_id");
    expect(migration).toContain('assert_current_original_member_user_message_v1');
    expect(migration).toContain('assert_current_original_assistant_lineage_v1');
    expect(migration).toContain('pg_catalog.sha256(pg_catalog.convert_to(');
    expect(migration).toContain('Se-yeon historical model text digest is not its DB original');
    expect(migration).toContain("a.validation_result_jsonb->'personalRecordProvenance'");
    expect(migration).toContain("a.seyeon_personal_source_pin_jsonb?'zeroProof'");
    expect(migration).toContain("a.seyeon_personal_source_pin_jsonb?'exactModelSourceSelection'");
    expect(migration).toContain("a.seyeon_personal_source_pin_jsonb#>'{zeroProof,records}'='[]'::jsonb");
    expect(migration).toContain('revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;');
    expect(migration).toMatch(/commit;\s*$/);
  });
});
