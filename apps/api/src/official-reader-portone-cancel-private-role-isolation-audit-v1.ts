/**
 * D3e18 OFFLINE, READ-ONLY role-denial audit. Never a runtime permission gate.
 *
 * This checks a supplied PostgreSQL catalogue snapshot, not a real deployed
 * process, OS credential, DB owner, or PostgreSQL transaction. A trusted DBA
 * must independently verify the source DB, service identity, and isolation.
 * This module has NO GRANT/REVOKE, SQL mutation, payment, or refund capability.
 */
export const PRIVATE_CANCEL_DIRECT_ROUTINES_D3E18 = Object.freeze([
  'internal_private_cancel_review_v1',
  'internal_private_cancel_commit_review_approval_v1',
  'internal_apply_reviewed_official_reader_full_cancel_private_v1',
  'internal_apply_entitlement_effect_v1',
  'internal_apply_official_reader_verified_cancel_batch_v1',
  'internal_execute_official_reader_verified_cancel_v2',
] as const);

export const PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18 = Object.freeze([
  'anon', 'authenticated', 'service_role',
  'myeongha_api_executor',
  'myeongha_commerce_internal_executor',
  'myeongha_seyeon_chat_runtime_owner',
] as const);

/** Only the database catalogue supplies effective privileges and membership.
 * has_function_privilege covers PUBLIC grants and inherited effective rights.
 * This query checks the role's potential membership of the owner too, so a
 * non-inherited role with SET ROLE cannot pass by hiding behind NOINHERIT.
 */
export const PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18 = [
  'SELECT r.rolname AS "roleName", r.rolcanlogin AS "canLogin",',
  'r.rolsuper AS "superuser", r.rolbypassrls AS "bypassRls",',
  'r.rolcreaterole AS "createRole", r.rolcreatedb AS "createDb",',
  'pg_has_role(r.oid, (SELECT oid FROM pg_roles WHERE rolname=$2::name),',
  "'MEMBER') AS \"memberOfOwner\"",
  'FROM pg_roles r WHERE r.rolname = ANY($1::text[]) ORDER BY r.rolname',
].join(' ');

export const PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18 = [
  'SELECT r.rolname AS "roleName", p.proname AS "routineName",',
  'n.nspname AS "schemaName", p.oid::text AS "routineOid",',
  'has_function_privilege(r.oid,p.oid,',
  "'EXECUTE') AS \"canExecute\"",
  'FROM pg_roles r CROSS JOIN pg_proc p',
  'JOIN pg_namespace n ON n.oid = p.pronamespace',
  'WHERE r.rolname = ANY($1::text[])',
  'AND p.proname = ANY($2::text[])',
  "AND n.nspname NOT IN ('pg_catalog','information_schema')",
  "AND n.nspname NOT LIKE 'pg_toast%'",
  'ORDER BY r.rolname,p.proname,n.nspname,p.oid',
].join(' ');

export type PrivateCancelD3e18RoleNames = Readonly<{
  verifier: string;
  executor: string;
  owner: string;
}>;
export type PrivateCancelReadOnlyCatalogD3e18 = Readonly<{
  query(sql: string, params: readonly unknown[]): Promise<{rows: unknown[]}>;
}>;

const ROLE_NAME = /^[a-z_][a-z0-9_]{1,62}$/u;
const ROUTINES: readonly string[] = PRIVATE_CANCEL_DIRECT_ROUTINES_D3E18;
const APP_ROLES: readonly string[] = PRIVATE_CANCEL_OTHER_APP_ROLES_D3E18;

function plainRow(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function fail(reason: string): never {
  throw new Error('Offline cancel role-isolation audit DENY: ' + reason);
}
function distinctRoles(roles: PrivateCancelD3e18RoleNames): string[] {
  const supplied = [roles?.verifier, roles?.executor, roles?.owner];
  if (supplied.some(x => typeof x !== 'string' || !ROLE_NAME.test(x))
    || new Set(supplied).size !== 3
    || supplied.some(x => APP_ROLES.includes(x))) {
    fail('untrusted, shared or ordinary application service identity');
  }
  return [...supplied, ...APP_ROLES];
}

export type PrivateCancelD3e18ReadOnlyAuditResult = Readonly<{
  mode: 'offline-catalog-evidence-only';
  checkedRoleCount: number;
  checkedRoutineCount: number;
  deniedDirectCalls: number;
  liveRoleIsolationVerified: false;
}>;

/**
 * Never use this return value as an authorization token. It is an assertion
 * over READ-ONLY evidence gathered by a separately provisioned account.
 * A caller can fabricate a query implementation, so passing is not proof of
 * production login isolation or that the DB owner cannot directly execute.
 */
export async function auditOfflinePrivateCancelRoleDenialsD3e18(input: Readonly<{
  serviceRoles: PrivateCancelD3e18RoleNames;
  catalog: PrivateCancelReadOnlyCatalogD3e18;
}>): Promise<PrivateCancelD3e18ReadOnlyAuditResult> {
  if (!input?.serviceRoles || typeof input?.catalog?.query !== 'function') {
    fail('no separately supplied read-only catalogue');
  }
  const names = distinctRoles(input.serviceRoles);
  let roleRows: unknown[], functionRows: unknown[];
  try {
    const roles = await input.catalog.query(
      PRIVATE_CANCEL_ROLE_CATALOG_READ_SQL_D3E18,
      [names, input.serviceRoles.owner],
    );
    const funcs = await input.catalog.query(
      PRIVATE_CANCEL_FUNCTION_CATALOG_READ_SQL_D3E18,
      [names, ROUTINES],
    );
    roleRows = roles.rows;
    functionRows = funcs.rows;
  } catch {
    fail('catalogue inaccessible or query failed');
  }
  if (!Array.isArray(roleRows) || roleRows.length !== names.length) {
    fail('missing, duplicated or unexpected service role');
  }
  const uniqueRole = new Set<string>();
  for (const raw of roleRows) {
    if (!plainRow(raw) || typeof raw.roleName !== 'string'
      || !names.includes(raw.roleName)
      || uniqueRole.has(raw.roleName)) {
      fail('role catalogue row missing, unexpected or duplicated');
    }
    uniqueRole.add(raw.roleName);
    if (typeof raw.canLogin !== 'boolean'
      || typeof raw.superuser !== 'boolean'
      || typeof raw.bypassRls !== 'boolean'
      || typeof raw.createRole !== 'boolean'
      || typeof raw.createDb !== 'boolean'
      || typeof raw.memberOfOwner !== 'boolean') {
      fail('incomplete privilege or membership evidence');
    }
    if (raw.superuser || raw.bypassRls || raw.createRole || raw.createDb) {
      fail('privileged login or inherited administrator role');
    }
    if ([input.serviceRoles.verifier, input.serviceRoles.executor,
      input.serviceRoles.owner].includes(raw.roleName) && raw.canLogin !== true) {
      fail('dedicated service login absent');
    }
    if (raw.roleName !== input.serviceRoles.owner && raw.memberOfOwner) {
      fail('verifier, executor or application role can become database owner');
    }
    if (raw.roleName === input.serviceRoles.owner && !raw.memberOfOwner) {
      fail('database owner role membership observation incomplete');
    }
  }

  if (!Array.isArray(functionRows)
    || functionRows.length !== names.length * ROUTINES.length) {
    fail('missing/extra function, overload, schema or grant evidence');
  }
  const observed = new Set<string>();
  const seenOids = new Map<string,string>();
  for (const raw of functionRows) {
    if (!plainRow(raw)
      || typeof raw.roleName !== 'string' || !names.includes(raw.roleName)
      || typeof raw.routineName !== 'string' || !ROUTINES.includes(raw.routineName)
      || raw.schemaName !== 'public'
      || typeof raw.routineOid !== 'string' || !/^[0-9]+$/u.test(raw.routineOid)
      || typeof raw.canExecute !== 'boolean') {
      fail('unexpected function identity, schema or malformed privilege');
    }
    const key = raw.roleName + ':' + raw.routineName;
    if (observed.has(key)) fail('overloaded or duplicated protected routine');
    observed.add(key);
    const knownOid = seenOids.get(raw.routineName);
    if (knownOid !== undefined && knownOid !== raw.routineOid) {
      fail('inconsistent protected routine identity across roles');
    }
    seenOids.set(raw.routineName,raw.routineOid);
    if (raw.canExecute) {
      fail('direct protected function execution permitted for ' + raw.roleName);
    }
  }
  if (seenOids.size !== ROUTINES.length) {
    fail('not all protected functions were verified');
  }
  // Database owner deliberately remains OUTSIDE the negative EXECUTE matrix:
  // its real SQL privileges cannot be disabled by an offline TS checker.
  // This check rejects ALL direct privileges, including the provisional owner,
  // so an actual SQL owner will NOT pass. No production claim follows.
  return Object.freeze({
    mode: 'offline-catalog-evidence-only' as const,
    checkedRoleCount: names.length,
    checkedRoutineCount: ROUTINES.length,
    deniedDirectCalls: names.length * ROUTINES.length,
    liveRoleIsolationVerified: false as const,
  });
}
