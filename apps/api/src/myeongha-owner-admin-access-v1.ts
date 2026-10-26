// Watchtower-Track: commerce-payment
import { executePostgresSubjectTransactionV1 } from './postgres-subject-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export async function readOwnerAdminAccessV1(pool:PostgresSubjectPoolV1, verifiedEvidence:VerifiedSubjectIdentityEvidenceV1) {
  if (verifiedEvidence.kind !== 'member') return {isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false};
  return executePostgresSubjectTransactionV1({pool,verifiedEvidence,execute:async({client,resolvedSubject})=>{
    const result=await client.query<{isOwnerAdmin:boolean;chatCreditExempt:boolean;sandboxCheckoutAllowed:boolean}>(
      'select is_owner_admin as "isOwnerAdmin",chat_credit_exempt as "chatCreditExempt",sandbox_checkout_allowed as "sandboxCheckoutAllowed" from public.qry_myeongha_owner_admin_access_v1($1::uuid)',
      [resolvedSubject.subjectId],
    );
    if(result.rows.length!==1)throw Error('Owner access authority unavailable');
    const row=result.rows[0];
    if(!row||typeof row.isOwnerAdmin!=='boolean'||typeof row.chatCreditExempt!=='boolean'||typeof row.sandboxCheckoutAllowed!=='boolean'||((row.chatCreditExempt||row.sandboxCheckoutAllowed)&&!row.isOwnerAdmin))throw Error('Invalid owner access authority');
    return Object.freeze({...row});
  }});
}
