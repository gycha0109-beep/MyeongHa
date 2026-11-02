// Watchtower-Track: security
// Exact server-only positive/nonpositive separation before paid inference.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';
const REQUIRED = Object.freeze([
  'public.cmd_issue_seyeon_zero_source_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)',
  'public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)',
  'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)',
]);

export const SEYEON_ZERO_FIRST_RECEIPT_ISSUER_V1 =
  'public.cmd_issue_seyeon_zero_source_first_reply_v1';

export async function assertSeyeonZeroSourceHttpReceiptReadyV1(client: PostgresTransactionQueryV1): Promise<void> {
  const r=await client.query<{ready:boolean}>(`select count(*)=3 as ready
    from pg_catalog.pg_proc p
    where p.oid in(to_regprocedure($1),to_regprocedure($2),to_regprocedure($3))
      and p.prosecdef
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
      and 'row_security=off'=any(p.proconfig)
      and has_function_privilege(current_user,p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')`,REQUIRED);
  if(r.rows.length!==1||r.rows[0]?.ready!==true) {
    throw new Error('Zero-source first reply receipt DB authority is not ready.');
  }
}
