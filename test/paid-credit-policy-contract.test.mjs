import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const sql=readFileSync(new URL('../supabase/migrations/20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql',import.meta.url),'utf8');
describe('Approved paid credit ledger',()=>{
 it('enforces signup 30d, paid never-expiring, first reading 90d',()=>{
   expect(sql).toContain("source_kind='signup' and credits_issued=50");
   expect(sql).toContain("expires_at=issued_at+interval '30 days'");
   expect(sql).toContain("source_kind='portone_topup' and credits_issued=300");
   expect(sql).toContain('expires_at is null');
   expect(sql).toContain("source_kind='reading_reward' and credits_issued=150");
   expect(sql).toContain("expires_at=issued_at+interval '90 days'");
 });
 it('pins provider receipt and amount and replay uniqueness',()=>{
   for(const s of ["cr.provider='portone_v2'","cr.environment='production'",
     "cr.verification_status='verified'","cr.verified_amount_minor=1900",
     "cr.verified_currency='KRW'","p.product_key='chat_credits_300_v1'",
     'chat_credit_lots_global_source_v1',
     "p_validity_mode is distinct from 'never'"])expect(sql).toContain(s);
 });
 it('forbids exposed callers from minting or issuing reading rewards',()=>{
   expect(sql).toContain('revoke all on function public.internal_cmd_chat_credit_verified_topup_v1(');
   expect(sql).toContain('revoke all on function public.internal_cmd_chat_first_paid_reading_reward_v1(');
   expect(sql.match(/from public,anon,authenticated,service_role,myeongha_api_executor;/g)).toHaveLength(2);
   expect(sql).toContain('chat_credit_first_paid_reading_once_v1');
 });
});
