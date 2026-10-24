import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const file=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('Production Credit Signup scoped-only rollout guard',()=>{
  const workflow=file('../../../.github/workflows/supabase-production.yml');
  const script=file('../../../scripts/operations/run-supabase-production-migrations.sh');
  it('only selects isolated migration 1725 on exactly one changed migration',()=>{
    expect(workflow).toContain("migration_changes\" == 'supabase/migrations/1725_chat_credit_signup_wallet_runtime_v1.sql'");
    expect(workflow).toContain('SUPABASE_CHAT_CREDIT_SIGNUP_SCOPE_ONLY:');
    expect(workflow).toContain('chat_credit_signup_scope_only=$chat_credit_signup_scope_only');
  });
  it('holds on competing scopes, SQL hash drift and inconsistent history',()=>{
    for(const marker of ['HOLD_CREDIT_SIGNUP_CONFLICTING_PRODUCTION_SCOPE',
      'HOLD_CREDIT_SIGNUP_SQL_HASH_DRIFT','HOLD_CREDIT_SIGNUP_BASE_MIGRATION_UNAVAILABLE',
      'HOLD_CREDIT_SIGNUP_HISTORY_SCHEMA_DISAGREEMENT',
      'HOLD_CREDIT_SIGNUP_PRODUCTION_VERIFICATION'])expect(script).toContain(marker);
    expect(script).toContain("credit_version='1725'");
    expect(script).toContain('supabase migration repair "$credit_version" --status applied');
    expect(script).toContain('psql -X -v ON_ERROR_STOP=1 -1');
    expect(script).toContain('PASS_CREDIT_SIGNUP_SCOPED_PRODUCTION_1725_APPLIED_NO_BACKLOG_REPLAY');
  });
});
