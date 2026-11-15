import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPORT_VERSION = 'ops-rls-disabled-effective-grants-report-v1';
const ROLES = Object.freeze(['anon', 'authenticated', 'myeongha_api_executor', 'service_role']);
const PRIVILEGES = Object.freeze([
  'select','insert','update','delete','truncate','references','trigger',
]);
const ROLE_COLUMNS = ['roleExists','schemaUsage',...PRIVILEGES];
const RECORD_KEYS = [
  'schema','table','tableExists','tableKind','owner',
  'rowSecurityEnabled','forceRowSecurity','currentPolicyCount','rolePrivileges',
];
const sameKeys = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every((k) => Object.hasOwn(value,k));
const fail = (reason) => { throw Error('RLS_DISABLED_GRANT_EVIDENCE_INVALID: ' + reason); };
const isBooleanOrNull = (v) => v === null || typeof v === 'boolean';

export function validateCurrentRlsDisabledGrants(report, source, sql) {
  if (!sameKeys(report, ['schemaVersion','sourceQuery','sourceMetadata',
    'productionProjectRef','evidence','summary','authority','limitations']) ||
      report.schemaVersion !== REPORT_VERSION ||
      report.sourceQuery !== 'scripts/operations/production-rls-disabled-policy-role-grants-readonly.sql' ||
      report.sourceMetadata !== 'docs/operations/POSTGRES_REMOTE_ONLY_CURRENT_OBJECT_METADATA_20261108.json' ||
      report.productionProjectRef !== source?.productionProjectRef)
    fail('source mismatch');
  const a=report.authority;
  if (!sameKeys(a,['readOnly','metadataOnly','appRouteContainmentVerified',
    'indirectFunctionAccessVerified','allSchemasRolesAccessVerified',
    'restoredSchemaParityVerified','productionPermissionMutationAuthorized',
    'drReady','serviceResumptionAllowed']) ||
      a.readOnly!==true || a.metadataOnly!==true ||
      Object.keys(a).filter(k=>!['readOnly','metadataOnly'].includes(k)).some(k=>a[k]!==false))
    fail('forged authorization');
  if (!Array.isArray(report.limitations) || report.limitations.length < 4 ||
      report.limitations.some(x=>typeof x!=='string'))
    fail('limitations missing');
  if (!/BEGIN TRANSACTION READ ONLY;/u.test(sql) ||
      !/ROLLBACK;\s*$/u.test(sql) ||
      !/pg_catalog\.has_table_privilege/u.test(sql) ||
      !/pg_catalog\.has_schema_privilege/u.test(sql))
    fail('query scope or read-only marker');
  const idMatches=[...sql.matchAll(/\('public','([a-z_]+)'\)/gu)].map(m=>`public.${m[1]}`);
  if (idMatches.length!==18 || new Set(idMatches).size!==18)
    fail('SQL target list length or duplicates');
  if (source?.schemaVersion!=='ops-remote-only-current-object-metadata-report-v1' ||
      source?.summary?.policiesOnRlsDisabledTables!==20 ||
      source?.catalogueEvidence?.transactionReadOnly!==true ||
      !Array.isArray(source?.catalogueEvidence?.perVersion))
    fail('prior metadata authority');
  const prior=new Map();
  let priorMarkers=0;
  for (const batch of source.catalogueEvidence.perVersion) {
    for (const p of batch.policies) {
      if (p.catalog?.rowSecurityEnabled!==false) continue;
      const key=p.schema+'.'+p.table;
      prior.set(key,(prior.get(key)||0)+1);
      priorMarkers++;
    }
  }
  if (priorMarkers!==20 || prior.size!==18 ||
      idMatches.some(x=>!prior.has(x)))
    fail('prior RLS-disabled target mismatch');
  const ev=report.evidence;
  if (!sameKeys(ev,['schemaVersion','observedAtUtc','transactionReadOnly',
    'targetDistinctTableCount','tables']) ||
      ev.schemaVersion!=='ops-current-rls-disabled-role-grants-v1' ||
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(ev.observedAtUtc) ||
      !Number.isFinite(Date.parse(ev.observedAtUtc)) ||
      Date.parse(ev.observedAtUtc)<Date.parse(source.catalogueEvidence.observedAtUtc) ||
      ev.transactionReadOnly!==true || ev.targetDistinctTableCount!==18 ||
      !Array.isArray(ev.tables) || ev.tables.length!==18)
    fail('catalog observation scope');
  const counts=Object.fromEntries(ROLES.map(role=>[role,{
    roleAvailable:0,readGrantAndSchemaUsage:0,anyWriteGrantAndSchemaUsage:0,
  }]));
  const seen=new Set();
  let policies=0,rlsEnabled=0,missing=0;
  for (const table of ev.tables) {
    if (!sameKeys(table, RECORD_KEYS) || table.schema!=='public' ||
        !idMatches.includes(table.schema+'.'+table.table) ||
        seen.has(table.schema+'.'+table.table) ||
        table.tableExists!==true || !['r','p'].includes(table.tableKind) ||
        typeof table.owner!=='string' || typeof table.currentPolicyCount!=='number' ||
        !Number.isInteger(table.currentPolicyCount) || table.currentPolicyCount<0 ||
        table.rowSecurityEnabled!==false ||
        typeof table.forceRowSecurity!=='boolean' ||
        !sameKeys(table.rolePrivileges,ROLES))
      fail('table scope or RLS state');
    seen.add(table.schema+'.'+table.table);
    policies+=table.currentPolicyCount;
    rlsEnabled+=Number(table.rowSecurityEnabled);
    missing+=Number(!table.tableExists);
    for (const role of ROLES) {
      const p=table.rolePrivileges[role];
      if (!sameKeys(p,ROLE_COLUMNS) || p.roleExists!==true ||
          ROLE_COLUMNS.some(k=>!isBooleanOrNull(p[k])) ||
          p.schemaUsage!==true)
        fail('role or table privilege shape');
      if (role !== 'service_role' && PRIVILEGES.some(k => p[k] === true))
        fail('unexpected direct table grants for a non-service role on RLS-disabled table');
      counts[role].roleAvailable++;
      counts[role].readGrantAndSchemaUsage+=Number(p.select===true);
      counts[role].anyWriteGrantAndSchemaUsage+=Number(
        ['insert','update','delete'].some(k=>p[k]===true));
    }
  }
  const s=report.summary;
  if (!sameKeys(s,['distinctTables','currentPoliciesOnTheseTables',
    'distinctRlsEnabledTables','missingTables','effectiveRoleCounts']) ||
      s.distinctTables!==seen.size || s.distinctTables!==18 ||
      s.currentPoliciesOnTheseTables!==policies ||
      s.distinctRlsEnabledTables!==rlsEnabled || s.missingTables!==missing ||
      !sameKeys(s.effectiveRoleCounts,ROLES))
    fail('summary mismatch');
  for (const role of ROLES)
    if (!sameKeys(s.effectiveRoleCounts[role],Object.keys(counts[role])) ||
        Object.keys(counts[role]).some(k=>counts[role][k]!==s.effectiveRoleCounts[role][k]))
      fail('summary role grants mismatch');
  return Object.freeze({
    distinctPolicyIndicatorCount:priorMarkers, distinctTableCount:seen.size,
    currentPolicyCount:policies, rlsDisabledTableCount:18,
    effectiveRoleCounts:Object.freeze(counts),
    currentMetadataOnly:true, databasePermissionChangeAllowed:false,
  });
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [report,source,sql]=await Promise.all([
    readFile('docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json','utf8').then(JSON.parse),
    readFile('docs/operations/POSTGRES_REMOTE_ONLY_CURRENT_OBJECT_METADATA_20261108.json','utf8').then(JSON.parse),
    readFile('scripts/operations/production-rls-disabled-policy-role-grants-readonly.sql','utf8'),
  ]);
  const v=validateCurrentRlsDisabledGrants(report,source,sql);
  process.stdout.write('Phase 8-A RLS-disabled effective grant census PASS '+JSON.stringify(v)+'\n');
}
