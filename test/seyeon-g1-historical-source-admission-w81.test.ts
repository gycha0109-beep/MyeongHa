// Watchtower-Track: security
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(name:string)=>readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/'+name,import.meta.url,
),'utf8');
describe('W81 owner-issued historical G1 exact model SOURCE admission (S0 HOLD)',()=>{
  const source=read('26-g1-historical-source-admission.sql');
  const g2=read('25-g2-historical-same-tx-originals-hold.sql');
  const install=readFileSync(new URL(
    '../scripts/operations/seyeon-security-s0/install-isolated.mjs',
    import.meta.url,
  ),'utf8');
  const plan=readFileSync(new URL(
    '../scripts/operations/seyeon-security-s0/plan.mjs',
    import.meta.url,
  ),'utf8');
  it('places an immutable owner-only G1 source admission AFTER the final context seal',()=>{
    expect(source).toContain('seyeon_historical_g1_source_admission_jsonb');
    expect(source).toContain("current_user is distinct from 'myeongha_seyeon_chat_runtime_owner'");
    expect(source).toContain('seyeon_historical_g1_source_admission_immutable');
    expect(source).toContain('for update of t,a');
    expect(source).toContain('seyeon_historical_final_context_seal_jsonb');
    expect(source).toContain('candidatePgJsonbDigest');
    expect(source).toContain('expectedFinalModelContextDigest');
    expect(source).toContain('seyeon_historical_g1_admission_source_mismatch');
    expect(source).toContain('seyeon_historical_g1_admission_write_failed');
    expect(source).toContain("and a.seyeon_historical_g1_source_admission_jsonb is null");
    const pSeal=plan.indexOf("'24-g1-historical-final-context-seal.sql'");
    const pAdmission=plan.indexOf("'26-g1-historical-source-admission.sql'");
    const pG2=plan.indexOf("'25-g2-historical-same-tx-originals-hold.sql'");
    expect(pSeal).toBeGreaterThan(0);
    expect(pAdmission).toBeGreaterThan(pSeal);
    expect(pG2).toBeGreaterThan(pAdmission);
  });
  it('requires explicit model-source registry approval and all original Grant locks',()=>{
    expect(source).toContain('seyeon_positive_source_type_registry_v1');
    expect(source).toContain('reg.enabled');
    expect(source).toContain("reg.record_kind='memory'");
    expect(source).toContain('for share of reg');
    expect(source).toContain('seyeon_historical_g1_model_source_type_unapproved');
    expect(source).toContain('qry_recheck_historical_candidate_originals_s0_v1(');
    expect(source).toContain('seyeon_historical_g1_admission_originals_revoked');
    expect(source).toContain("'historicalAssistantOriginalSourcesDigest'");
    expect(source).toContain("'originalGrantId'");
  });
  it('issues source eligibility but does not enable Provider/Commit/Reveal',()=>{
    expect(source).toContain("'authorizesSourceSelection',true");
    expect(source).toContain("'permitsModelDispatch',false");
    expect(source).toContain("'permitsAtomicCommit',false");
    expect(source).toContain("'permitsHttpReveal',false");
    expect(source).toContain('revoke all on function seyeon_private.cmd_admit_historical_g1_model_sources_s0_v1(');
    expect(install).toContain('cmd_admit_historical_g1_model_sources_s0_v1');
    expect(g2).toContain("v_source_admission->>'schemaVersion'");
    expect(g2).toContain("'seyeon-g1-historical-source-admission-s0-v1'");
    expect(g2).toContain("v_source_admission->>'originalGrantId'");
    expect(g2).toContain("v_source_admission->>'finalModelContextDigest'");
    expect(g2).toContain("v_source_admission->>'permitsModelDispatch' is distinct from 'false'");
    expect(g2).toContain("v_source_admission->>'permitsAtomicCommit' is distinct from 'false'");
    expect(read('02-atomic-commit.sql'))
      .toContain('seyeon_g2_historical_candidate_not_authority');
  });
});
