// Watchtower-Track: security
// The G2 wrapper never grants model/Commit/Reveal for historical candidate.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=(name:string)=>readFileSync(
  new URL('../scripts/operations/seyeon-security-s0/'+name,import.meta.url),'utf8'
);
describe('W77 historical G2 exact original sources remain closed within v2 Commit TX',()=>{
  const g2=sql('25-g2-historical-same-tx-originals-hold.sql');
  const g0=sql('23-g1-original-historical-current-audit.sql');
  const legacy=sql('02-atomic-commit.sql');

  it('rechecks DB-owned G1 immutable final seal and keeps current original locks',()=>{
    expect(g2).toContain('for update of t,a');
    expect(g2).toContain('seyeon_historical_final_context_seal_jsonb');
    expect(g2).toContain('historicalCandidateProof');
    expect(g2).toContain('candidatePgJsonbDigest');
    expect(g2).toContain('historicalFinalModelContextDigest');
    expect(g2).toContain('historicalCandidatePgJsonbDigest');
    expect(g2).toContain('seyeon_historical_g2_validated_model_receipt_required');
    expect(g2).toContain('seyeon_historical_g2_exact_seal_required');
    expect(g2).toContain('qry_recheck_historical_candidate_originals_s0_v1(');
    expect(g0).toContain("t.state='validated' and a.state='validated'");
    expect(g0).toContain('lock_original_memory_grant_v1(');
    expect(g0).toContain('lock_memory_subject_v1(');
  });
  it('executes historical current-rights assertion and real v2 Commit in one DB function',()=>{
    const wrapper=g2.slice(g2.indexOf(
      'create function seyeon_private.cmd_attempt_historical_same_tx_commit_hold_s0_v1('
    ));
    const guard=wrapper.indexOf(
      'perform seyeon_private.assert_historical_g2_sealed_originals_s0_v1('
    );
    const realCommit=wrapper.indexOf(
      'return query select * from public.cmd_commit_seyeon_chat_turn_runtime_v2('
    );
    const hold=wrapper.indexOf('seyeon_historical_g2_s0_commit_unconditionally_held');
    expect(guard).toBeGreaterThan(-1);
    expect(realCommit).toBeGreaterThan(guard);
    expect(hold).toBeGreaterThan(realCommit);
    expect(wrapper).not.toContain('COMMIT;');
    expect(wrapper).not.toContain('BEGIN TRANSACTION');
  });
  it('requires the actual Renderer and Output Guard execution logs for any later validated historical Commit',()=>{
    const check=g2.slice(g2.indexOf("if v_attempt_state='validated' and ("),
      g2.indexOf("v_count:=(v_candidate->>'historicalSourceCount')"));
    expect(check).toContain("v_validation->>'schemaVersion' is distinct from");
    expect(check).toContain("'seyeon-production-chat-validation-v1'");
    expect(check).toContain("v_validation->>'passed' is distinct from 'true'");
    expect(check).toContain("v_validation->>'generatedContentHash'");
    expect(check).toContain("v_generated_hash !~ '^sha256:v1:[a-f0-9]{64}$'");
    expect(check).toContain("generation.id=v_generation_id");
    expect(check).toContain("generation.subject_id=p_subject_id");
    expect(check).toContain("generation.turn_attempt_id=p_attempt_id");
    expect(check).toContain("generation.stage='renderer'");
    expect(check).toContain("generation.status='success'");
    expect(check).toContain("output_guard.id=v_output_guard_id");
    expect(check).toContain("output_guard.subject_id=p_subject_id");
    expect(check).toContain("output_guard.turn_attempt_id=p_attempt_id");
    expect(check).toContain("output_guard.stage='output_guard'");
    expect(check).toContain("output_guard.status='success'");
    expect(check).toContain("generation.output_ref_jsonb->>'generatedContentHash'");
    expect(check).toContain("output_guard.output_ref_jsonb->>'generatedContentHash'");
    // The current G1 positive source grant is still not issued in S0.
    expect(legacy).toContain('seyeon_g2_historical_candidate_not_authority');
  });
  it('blocks direct v2 bypass, every API ACL, and payment/model/HTTP opening',()=>{
    expect(legacy).toContain('seyeon_g2_historical_candidate_not_authority');
    expect(legacy).toContain('seyeon_positive_g2_historical_originals_not_authorized');
    const rawTrigger=legacy.slice(0,legacy.indexOf(
      'create function public.cmd_commit_seyeon_positive_chat_turn_v1('
    ));
    const historicalBranch=rawTrigger.slice(
      rawTrigger.indexOf("old.seyeon_personal_source_pin_jsonb ? 'historicalCandidateProof'"),
      rawTrigger.indexOf("if old.state='validated' and new.state='committed' and")
    );
    expect(historicalBranch).toContain(
      "if old.state='validated' and new.state='committed' then"
    );
    const exactGuard=historicalBranch.indexOf(
      'perform seyeon_private.assert_historical_g2_sealed_originals_s0_v1('
    );
    const unconditionalHold=historicalBranch.indexOf(
      "constraint='seyeon_g2_historical_candidate_not_authority'"
    );
    expect(exactGuard).toBeGreaterThan(0);
    expect(unconditionalHold).toBeGreaterThan(exactGuard);
    const install=readFileSync(new URL(
      '../scripts/operations/seyeon-security-s0/install-isolated.mjs',
      import.meta.url,
    ),'utf8');
    for(const name of [
      'assert_historical_g2_sealed_originals_s0_v1',
      'cmd_attempt_historical_same_tx_commit_hold_s0_v1',
    ]){
      expect(g2).toContain('revoke all on function seyeon_private.'+name);
      expect(install).toContain('seyeon_private.'+name);
    }
    expect(g2).not.toContain('grant execute on function seyeon_private.cmd_attempt');
    expect(g2).not.toContain('http');
    expect(g2).not.toContain('billing');
  });
});
