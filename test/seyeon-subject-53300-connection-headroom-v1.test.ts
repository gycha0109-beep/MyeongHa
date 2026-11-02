import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/production-24-subject-53300-connection-headroom-20261102.sql',
  import.meta.url),'utf8');

describe('Se-yeon Cloudflare Subject connection headroom',()=>{
  it('matches the incident-specific narrow Subject login role',()=>{
    expect(sql).toContain("rolname='myeongha_seyeon_subject_login'");
    expect(sql).toContain('r.rolconnlimit IS DISTINCT FROM 5');
    expect(sql).toContain('ALTER ROLE myeongha_seyeon_subject_login CONNECTION LIMIT 10;');
    expect(sql).toContain('r.rolconnlimit IS DISTINCT FROM 10');
    expect(sql).toContain("rolname='myeongha_seyeon_governed_login'");
    expect(sql).not.toMatch(/ALTER ROLE myeongha_seyeon_governed_login/iu);
  });
  it('never relaxes auth/RLS, protected cost accounting or DB global limits',()=>{
    expect(sql).toContain('r.rolsuper OR r.rolbypassrls');
    expect(sql).toContain('r.rolcreatedb OR r.rolcreaterole');
    expect(sql).not.toMatch(/ALTER (?:SYSTEM|DATABASE)\b/iu);
    expect(sql).not.toMatch(/(?:GRANT|REVOKE|DROP|TRUNCATE|DELETE)\s/iu);
    expect(sql).not.toMatch(/set\s+row_security|disable\s+row\s+level\s+security/iu);
    expect(sql).toMatch(/COMMIT;\s*$/u);
  });
});
