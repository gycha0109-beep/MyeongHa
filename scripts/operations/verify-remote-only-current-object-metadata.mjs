import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';


export const REMOTE_ONLY_METADATA_REPORT_VERSION =
  'ops-remote-only-current-object-metadata-report-v1';
const hash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v);
const keys = (obj, names) =>
  obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).length === names.length &&
  names.every((name) => Object.hasOwn(obj, name));
const error = (text) => { throw Error('REMOTE_ONLY_METADATA_INVALID: ' + text); };

export function verifyRemoteOnlyCurrentObjectMetadata({ report, manifest, presence, sql }) {
  if (!keys(report, ['schemaVersion','sourceSql','productionProjectRef','compareTo',
    'catalogueEvidence','summary','authorization','limitations']) ||
      report.schemaVersion !== REMOTE_ONLY_METADATA_REPORT_VERSION ||
      report.productionProjectRef !== 'cnsfpcdiyofqvhpcegfc' ||
      report.sourceSql !== 'scripts/operations/production-remote-only-current-object-metadata-readonly.sql' ||
      report.compareTo !== 'docs/operations/POSTGRES_REMOTE_ONLY_OBJECT_PRESENCE_20261107.json')
    error('source binding');
  const auth = report.authorization;
  if (!keys(auth, ['transactionReadOnly','existingObjectMetadataOnly',
    'historicalBodyEquivalenceProven','historicalOwnerAclEquivalenceProven',
    'isolatedRestoreEquivalenceProven','providerHostedRestorationProven',
    'serviceResumptionAllowed','drReady']) ||
    auth.transactionReadOnly !== true || auth.existingObjectMetadataOnly !== true ||
    ['historicalBodyEquivalenceProven','historicalOwnerAclEquivalenceProven',
      'isolatedRestoreEquivalenceProven','providerHostedRestorationProven',
      'serviceResumptionAllowed','drReady'].some((field) => auth[field] !== false))
    error('authority escalation');
  if (!Array.isArray(report.limitations) || report.limitations.length < 4)
    error('missing limitations');
  const data = report.catalogueEvidence;
  if (!keys(data,['perVersion','observedAtUtc','schemaVersion','foundVersionCount',
    'targetVersionCount','transactionReadOnly','liveMigrationFrontier',
    'liveMigrationLedgerCount']) ||
      data.schemaVersion !== 'ops-remote-only-current-object-metadata-v1' ||
      typeof data.observedAtUtc !== 'string' ||
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(data.observedAtUtc) ||
      !Number.isFinite(Date.parse(data.observedAtUtc)) ||
      data.transactionReadOnly !== true ||
      data.targetVersionCount !== 41 || data.foundVersionCount !== 41 ||
      data.liveMigrationLedgerCount !== 241 ||
      data.liveMigrationFrontier !== '20261105075227' ||
      !Array.isArray(data.perVersion) || data.perVersion.length !== 41)
    error('live evidence scope drift');
  const sourceIds = manifest?.entries?.map((row) => row.version);
  if (!Array.isArray(sourceIds) || sourceIds.length !== 41 ||
      manifest.summary.remoteOnlyAppliedVersionCount !== 41 ||
      presence?.comparedAppliedMigrationCount !== 41)
    error('source manifest scope');
  const sqlIds = [...sql.matchAll(/^\s*\('(\d{14})'\),?\s*$/gmu)].map((match) => match[1]);
  const observationIds = data.perVersion.map((row) => row.version);
  for (const ids of [sourceIds,sqlIds,observationIds]) {
    if (ids.length !== 41 || new Set(ids).size !== 41 ||
        JSON.stringify([...ids].sort()) !== JSON.stringify([...sourceIds].sort()))
      error('target version mismatch');
  }
  if (!/BEGIN TRANSACTION READ ONLY;/u.test(sql) ||
      !/ROLLBACK;\s*$/u.test(sql) ||
      !/pg_catalog\.pg_get_functiondef/u.test(sql) ||
      !/pg_catalog\.aclexplode/u.test(sql) ||
      !/pg_catalog\.pg_policies/u.test(sql) ||
      !/pg_catalog\.sha256/u.test(sql))
    error('not a read-only catalog query');
  const old= new Map(presence.perVersion.map((row)=>[row.version,row]));
  const totals = {
    functionIndicators:0,policyIndicators:0,tableIndicators:0,
    routineNames:0,routineOverloads:0,policyNames:0,tableNames:0,
    missingRoutines:0,missingPolicies:0,missingTables:0,
    ambiguousOverloads:0,policiesOnRlsDisabledTables:0,
  };
  const unique = new Set();
  for (const row of data.perVersion) {
    if (!keys(row, ['tables','version','policies','routines','tableIndicators',
      'policyIndicators','functionIndicators']) ||
      unique.has(row.version) ||
      !['functionIndicators','policyIndicators','tableIndicators'].every(
        (name) => Number.isInteger(row[name]) && row[name]>=0) ||
      !Array.isArray(row.routines) || !Array.isArray(row.policies) || !Array.isArray(row.tables))
      error('invalid per-version row');
    unique.add(row.version);
    const p=old.get(row.version);
    if (!p || row.functionIndicators !== p.functions ||
      row.policyIndicators !== p.policies || row.tableIndicators !== p.tables)
      error('old observation count mismatch');
    totals.functionIndicators+=row.functionIndicators;
    totals.policyIndicators+=row.policyIndicators;
    totals.tableIndicators+=row.tableIndicators;
    for (const f of row.routines) {
      if (!keys(f,['name','schema','overloads']) ||
          typeof f.name!=='string'||typeof f.schema!=='string'||!Array.isArray(f.overloads))
        error('routine indicator malformed');
      totals.routineNames++;
      totals.routineOverloads+=f.overloads.length;
      totals.missingRoutines+=+(f.overloads.length===0);
      totals.ambiguousOverloads+=+(f.overloads.length>1);
      for (const overload of f.overloads) {
        if (!keys(overload,['kind','owner','signature','aclSha256','anonExecute',
          'definitionSha256','securityDefiner','apiExecutorExecute','authenticatedExecute']) ||
            !hash(overload.definitionSha256)||!hash(overload.aclSha256) ||
            typeof overload.owner!=='string'||typeof overload.signature!=='string' ||
            typeof overload.securityDefiner!=='boolean' ||
            ![overload.apiExecutorExecute,overload.anonExecute,
              overload.authenticatedExecute].every((p)=>p===null||typeof p==='boolean'))
          error('routine hash/owner/ACL malformed');
      }
    }
    for (const policy of row.policies) {
      if (!keys(policy,['name','table','schema','catalog']) ||
          typeof policy.name!=='string'||typeof policy.table!=='string' ||
          typeof policy.schema!=='string') error('policy indicator malformed');
      totals.policyNames++;
      const c=policy.catalog;
      if (keys(c,[])) { totals.missingPolicies++; continue; }
      if (!keys(c,['roles','command','permissive','qualSha256',
        'tableOwner','withCheckSha256','forceRowSecurity','rowSecurityEnabled']) ||
        !hash(c.qualSha256)||!hash(c.withCheckSha256)||!Array.isArray(c.roles) ||
        typeof c.tableOwner!=='string' || typeof c.rowSecurityEnabled!=='boolean' ||
        typeof c.forceRowSecurity!=='boolean')
        error('policy expression/owner malformed');
      totals.policiesOnRlsDisabledTables+=+(c.rowSecurityEnabled===false);
    }
    for (const table of row.tables) {
      if (!keys(table,['name','schema','catalog']))error('table indicator malformed');
      totals.tableNames++;
      const c=table.catalog;
      if (keys(c,[])) {totals.missingTables++;continue;}
      if (!keys(c,['kind','owner','aclSha256','forceRowSecurity','rowSecurityEnabled']) ||
          !hash(c.aclSha256)||!['r','p'].includes(c.kind) ||
          typeof c.owner!=='string'||typeof c.rowSecurityEnabled!=='boolean' ||
          typeof c.forceRowSecurity!=='boolean')
        error('table catalog malformed');
    }
  }
  if (JSON.stringify(totals)!==JSON.stringify(report.summary) ||
      totals.functionIndicators!==82 || totals.policyIndicators!==82 ||
      totals.tableIndicators!==16 ||
      totals.missingRoutines!==0 || totals.missingPolicies!==0 || totals.missingTables!==0 ||
      totals.ambiguousOverloads!==0)
    error('catalogue totals or missing entry');
  return Object.freeze({...totals,observedAtUtc:data.observedAtUtc,
    transactionReadOnly:true, historicalParityApproved:false});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [report, manifest, presence, sql] = await Promise.all([
    readFile('docs/operations/POSTGRES_REMOTE_ONLY_CURRENT_OBJECT_METADATA_20261108.json','utf8').then(JSON.parse),
    readFile('docs/operations/POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json','utf8').then(JSON.parse),
    readFile('docs/operations/POSTGRES_REMOTE_ONLY_OBJECT_PRESENCE_20261107.json','utf8').then(JSON.parse),
    readFile('scripts/operations/production-remote-only-current-object-metadata-readonly.sql','utf8')
  ]);
  const summary=verifyRemoteOnlyCurrentObjectMetadata({report,manifest,presence,sql});
  console.log('Phase 8 remote-only current PG17 object metadata PASS ' + JSON.stringify(summary));
}
