import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSeyeonSecurityS0InstallationBundle} from
  '../scripts/operations/seyeon-security-s0/bundle.mjs';

const file=(name:string)=>readFile(new URL('../scripts/operations/seyeon-security-s0/'+name,
  import.meta.url),'utf8');

describe('S0 Production operator commands stay closed and reversible',()=>{
  it('always requires explicit CLI action and never touches DB by default',async()=>{
    for(const script of [
      'activate-production-s0-after-evidence.mjs',
      'emergency-stop-production-s0.mjs',
      'install-production-default-closed.mjs',
      'reconcile-existing-governed-login.mjs',
    ]){
      const result=spawnSync(process.execPath,[
        fileURLToPath(new URL('../scripts/operations/seyeon-security-s0/'+script,import.meta.url)),
      ],{encoding:'utf8',timeout:5000});
      expect(result.status).not.toBe(0);
    }
  });
  it('existing governed-login reconciliation refuses credential rotation and privileged connections',async()=>{
    const source=await file('reconcile-existing-governed-login.mjs');
    expect(source).toContain('BEGIN READ ONLY');
    expect(source).toContain('SEYEON_S0_EXISTING_GOVERNED_LOGIN_NO_ROTATION');
    expect(source).toContain("not rolbypassrls");
    expect(source).toContain('no_direct_policy_table');
    expect(source).toContain('no_direct_budget_table');
    expect(source).not.toMatch(/create\\s+role|alter\\s+role|grant\\s+.*\\s+to\\s+/i);
  });
  it('S0 source bundle contains owner-operated gates inaccessible to ordinary API',async()=>{
    const bundle=await buildSeyeonSecurityS0InstallationBundle();
    const sql=bundle.sql;
    expect(sql).toContain('cmd_set_s0_positive_source_gate_v1');
    expect(sql).toContain('cmd_set_s0_owner_rpc_permissions_v1');
    expect(sql).toContain('from public,anon,authenticated,service_role,myeongha_api_executor');
    expect(sql).toContain('to postgres');
    expect(bundle.files).toHaveLength(8);
  });
  it('Emergency stop closes fresh G1/G2/model while preserving delivery and withdrawal',async()=>{
    const sql=await file('stop-positive-use.sql');
    expect(sql).toContain('cmd_set_s0_positive_source_gate_v1(false)');
    expect(sql).toContain('cmd_set_s0_owner_rpc_permissions_v1(false)');
    expect(sql).toContain('is_active=false');
    expect(sql).toContain('cmd_issue_seyeon_positive_first_reply_v1');
    expect(sql).not.toMatch(/revoke[^;]*cmd_ack_seyeon_positive_reply_v1/s);
    expect(sql).not.toMatch(/revoke[^;]*cmd_request_seyeon_memory_revoke_v1/s);
    expect(sql).not.toMatch(/delete\s+from\s+public\.memory_items/i);
  });
  it('positive activation must verify source, edge, original DB and governor evidence',async()=>{
    const source=await file('activate-production-s0-after-evidence.mjs');
    expect(source).toContain('assertSeyeonS0ReleaseEvidenceV1');
    expect(source).toContain("'--release-evidence-file'");
    expect(source.indexOf('await assertSeyeonS0ReleaseEvidenceV1'))
      .toBeLessThan(source.indexOf('new Client('));
    expect(source).toContain("'myeongha_seyeon_governed_login'");
  });
});
