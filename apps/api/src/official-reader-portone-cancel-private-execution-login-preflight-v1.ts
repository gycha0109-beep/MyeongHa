/**
 * D3e9 PRE-PROVISIONING NEGATIVE EXECUTION-IDENTITY PREFLIGHT.
 *
 * Entirely OFFLINE; the tested login is an isolated disposable CI role only.
 * An unprovisioned operator/approval login MUST have no direct DB privileges.
 * Never import a built-in secret, configure runtime roles, set a scheduler,
 * GRANT a production principal, or mutate any payment/entitlement.
 *
 * Structural LIMIT: D3e8 is SECURITY INVOKER and calls D3e6. This negative
 * preflight prevents unsafe grants; it does NOT provide a usable nonbypassable
 * operator executor. D3e6 or table access granted later makes it fail closed.
 */

export const PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1 = `
select
  session_user::text as "sessionLogin",
  current_user::text as "effectiveRole",
  r.rolcanlogin as "canLogin",
  r.rolinherit as "canInherit",
  r.rolsuper as "isSuperuser",
  r.rolbypassrls as "canBypassRls",
  r.rolcreatedb as "canCreateDb",
  r.rolcreaterole as "canCreateRole",
  (select count(*)::text from pg_catalog.pg_auth_members m
    where m.member=r.oid) as "membershipCount",
  pg_catalog.has_schema_privilege(current_user,'public','CREATE')
    as "canCreatePublic",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_private_cancel_review_v1(uuid,text,text)','EXECUTE')
    as "canDirectReview",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_private_cancel_commit_review_approval_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)',
    'EXECUTE') as "canSignedReview",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_enqueue_official_reader_portone_cancel_inbox_v1(text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE') as "canEnqueueInbox",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_claim_official_reader_cancel_work_v1(text,integer)',
    'EXECUTE') as "canClaimWork",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_complete_official_reader_cancel_work_v1(uuid,text,uuid)',
    'EXECUTE') as "canCompleteWork",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_fail_official_reader_cancel_work_v1(uuid,text,uuid,text,boolean)',
    'EXECUTE') as "canFailWork",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_private_cancel_enqueue_alerts_v1()',
    'EXECUTE') as "canEnqueueAlerts",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_private_cancel_claim_alert_v1(text,integer)',
    'EXECUTE') as "canClaimAlerts",
  pg_catalog.has_function_privilege(current_user,
    'public.internal_private_cancel_finalize_alert_v1(uuid,text,uuid,boolean)',
    'EXECUTE') as "canFinalizeAlerts",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ingress_inbox_v1',
    'SELECT') as "canReadInbox",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ingress_inbox_v1',
    'UPDATE') as "canUpdateInbox",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ops_review_v1',
    'SELECT') as "canReadReview",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ops_review_v1',
    'INSERT') as "canInsertReview",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_cancel_review_approval_v1',
    'SELECT') as "canReadApproval",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_cancel_review_approval_v1',
    'INSERT') as "canInsertApproval",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ops_alert_outbox_v1',
    'SELECT') as "canReadAlerts",
  pg_catalog.has_table_privilege(current_user,
    'public.official_reader_portone_cancel_ops_alert_outbox_v1',
    'UPDATE') as "canUpdateAlerts"
from pg_catalog.pg_roles r
where r.rolname=session_user
`.trim();

const DISALLOWED_FLAGS = Object.freeze([
  'canInherit','isSuperuser','canBypassRls','canCreateDb','canCreateRole',
  'canCreatePublic','canDirectReview','canSignedReview','canEnqueueInbox',
  'canClaimWork','canCompleteWork','canFailWork',
  'canEnqueueAlerts','canClaimAlerts','canFinalizeAlerts',
  'canReadInbox','canUpdateInbox','canReadReview','canInsertReview',
  'canReadApproval','canInsertApproval','canReadAlerts','canUpdateAlerts',
] as const);

export type PrivateCancelExecutionIdentityPreflightV1 = Readonly<{
  kind: 'deny_all_login_preflight_pass';
  effectAuthorized: false;
  directReviewAuthorized: false;
  signedReviewAuthorized: false;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

/**
 * Only a direct, isolated login may receive a zero-authority preflight PASS.
 * This test is deliberately NEGATIVE; it must not authorize real operation.
 */
export function validatePrivateCancelExecutionLoginPreflightV1(
  input: unknown,
  expectedLogin: string,
): PrivateCancelExecutionIdentityPreflightV1 {
  if (typeof expectedLogin!=='string'
    || !/^myeongha_cancel_d3e9_[a-z0-9_]{2,32}_ci$/u.test(expectedLogin)
    || input===null || typeof input!=='object' || Array.isArray(input)) {
    throw new Error('Private cancellation login preflight invalid or missing.');
  }
  const row=input as Record<string,unknown>;
  const expectedFields=[
    'sessionLogin','effectiveRole','canLogin','membershipCount',
    ...DISALLOWED_FLAGS,
  ];
  if (JSON.stringify(Object.keys(row).sort())!==JSON.stringify(expectedFields.sort())
    || row.sessionLogin!==expectedLogin || row.effectiveRole!==expectedLogin
    || row.canLogin!==true || row.membershipCount!=='0'
    || DISALLOWED_FLAGS.some(flag=>row[flag]!==false)) {
    throw new Error('Private cancellation login authority preflight DENIED.');
  }
  return Object.freeze({
    kind:'deny_all_login_preflight_pass',
    effectAuthorized:false,
    directReviewAuthorized:false,
    signedReviewAuthorized:false,
    providerRefundAuthorized:false,
    entitlementMutationAuthorized:false,
  });
}
