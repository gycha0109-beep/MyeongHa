// Watchtower-Track: security
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=(name:string)=>readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/'+name,import.meta.url,
),'utf8');
describe('W88 G3 historical first Reveal original-source review (no right to disclose)',()=>{
  const g0=sql('23-g1-original-historical-current-audit.sql');
  const g3=sql('27-g3-historical-first-reveal-current-originals-hold.sql');
  const install=readFileSync(new URL(
    '../scripts/operations/seyeon-security-s0/install-isolated.mjs',import.meta.url,
  ),'utf8');
  it('limits committed-original auditing to exact committed Turn/Attempt pairs',()=>{
    expect(g0).toContain("t.state='committed' and a.state='committed'");
    expect(g0).toContain('t.committed_at is not null');
    expect(g0).toContain('t.committed_attempt_id=a.id');
    expect(g0).toContain("t.state='context_ready' and a.state='running'");
  });
  it('holds first Reveal and replay unless there is exact DB-owned Commit evidence',()=>{
    for(const requirement of [
      "p_purpose not in ('audit_only','first')",
      "constraint='seyeon_historical_g3_replay_never_authorized'",
      "p_purpose='first' and t.state='committed'",
      "t.delivered_at is null and t.committed_at is not null",
      "t.committed_attempt_id=a.id",
      "a.seyeon_positive_delivery_issued_at is null",
      "t.client_turn_id=p_expected_client_turn_id",
      "a.committed_message_id=p_expected_assistant_message_id",
      "v_candidate->>'currentUserMessageId' is distinct from",
      "p_expected_user_message_id::text",
      "constraint='seyeon_historical_g3_original_commit_required'",
      'p_expected_post_turn_outbox_event_id',
      "oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'",
      "assistant.sender_type='character'",
    ])expect(g3).toContain(requirement);
  });
  it('rechecks immutable original candidate, G1 final Context, source admission, registry and current Grants',()=>{
    const owner=g3.indexOf('perform seyeon_private.lock_memory_subject_v1(');
    const locked=g3.indexOf('for update of t,a');
    const registry=g3.indexOf(
      'perform 1 from public.seyeon_positive_source_type_registry_v1 reg'
    );
    const audit=g3.indexOf(
      'v_audit:=seyeon_private.qry_recheck_historical_candidate_originals_s0_v1('
    );
    expect(owner).toBeGreaterThan(0);
    expect(locked).toBeGreaterThan(owner);
    expect(registry).toBeGreaterThan(locked);
    expect(audit).toBeGreaterThan(registry);
    for(const requirement of [
      "v_seal->>'candidatePgJsonbDigest'",
      "v_admission->>'originalGrantId'",
      "v_admission->>'historicalAssistantOriginalSourcesDigest'",
      "v_admission->>'historicalSourceCensusDigest'",
      "reg.record_kind='memory' and reg.enabled",
      "reg.projector_version=v_candidate->>'projectorVersion'",
      'for share of reg',
      "constraint='seyeon_historical_g3_source_type_disabled'",
      "constraint='seyeon_historical_g3_original_grant_revoked'",
    ])expect(g3).toContain(requirement);
  });
  it('binds the ACTUAL stored assistant to its staged payload, full-envelope digest, Renderer and Output Guard',()=>{
    const first=g3.slice(g3.indexOf("if p_purpose='first' then"));
    for(const requirement of [
      'a.generated_content_hash',
      'a.generated_body_text',
      'a.generated_message_payload_jsonb',
      'a.generated_message_schema_version',
      'a.generation_ai_execution_log_id',
      'a.validation_ai_execution_log_id',
      'a.validation_result_jsonb',
      "v_generated_hash !~ '^sha256:v1:[a-f0-9]{64}$'",
      "v_validation->>'schemaVersion' is distinct from",
      "'seyeon-production-chat-validation-v1'",
      "v_validation->>'passed' is distinct from 'true'",
      "v_validation->>'generatedContentHash' is distinct from",
      "v_validation->>'historicalFinalModelContextDigest'",
      "v_validation->>'historicalCandidatePgJsonbDigest'",
      "gen.stage='renderer' and gen.status='success'",
      "guard.stage='output_guard' and guard.status='success'",
      "gen.output_ref_jsonb->>'generatedContentHash'=v_generated_hash",
      "guard.output_ref_jsonb->>'generatedContentHash'=v_generated_hash",
      'for share of gen,guard',
      'assistant.body_text=v_generated_body',
      'assistant.message_payload_jsonb is not distinct from',
      'assistant.message_schema_version is not distinct from',
      'assistant.content_hash=v_generated_hash',
      "constraint='seyeon_historical_g3_original_generation_invalid'",
      "constraint='seyeon_historical_g3_original_ai_logs_missing'",
      "constraint='seyeon_historical_g3_commit_receipt_missing'",
    ])expect(first).toContain(requirement);
    // The source review checks only persisted fields; it never returns them.
    const returned=first.slice(first.lastIndexOf('return jsonb_build_object('));
    expect(returned).not.toContain('v_generated_body');
    expect(returned).not.toContain('assistant.body_text');
  });
  it('returns ONLY non-authorizing source review, never private bytes or API EXECUTE',()=>{
    for(const denied of [
      "'authorizesFirstReveal',false",
      "'authorizesCommittedReplay',false",
      "'permitsStreaming',false",
      "'permitsHttpReveal',false",
    ])expect(g3).toContain(denied);
    expect(g3).not.toContain("return query select");
    expect(g3).not.toContain("set state='delivered'");
    expect(g3).toContain(
      'revoke all on function seyeon_private.qry_review_historical_first_reveal_originals_s0_v1('
    );
    expect(install).toContain(
      'seyeon_private.qry_review_historical_first_reveal_originals_s0_v1('
    );
  });
});
