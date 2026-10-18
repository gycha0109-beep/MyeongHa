import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateOfficialReaderMigrationParityV1 } from './m1-18-migration-parity-gate.mjs';

const tens = (first, last) =>
  Array.from({ length: (last - first) / 10 + 1 },
    (_, index) => String(first + index * 10));

/**
 * Explicit waves, not a suggested automatic application sequence.
 * No wave may be promoted without its own owner/DB/Security release approval.
 */
export const M119_IMPACT_WAVES = Object.freeze([
  {
    id: 'P0_PRIVACY_DELETION_FINALIZER',
    versions: ['1520'],
    authority: 'Privacy + DB',
    impact: 'Existing account-deletion finalizer function body; invocation can delete subject data',
    release: 'SEPARATE_DESTRUCTIVE_PRIVACY_REVIEW_REQUIRED',
  },
  {
    id: 'P1_CHARACTER_FACE_ARTIFACT',
    versions: ['1530'],
    authority: 'Character/Face + DB',
    impact: 'New durable Character/Face artifact and private writer, RLS and role',
    release: 'SEPARATE_CHARACTER_DATA_PRIVACY_REVIEW_REQUIRED',
  },
  {
    id: 'P2_SAJU_NONCE_PROOF',
    versions: ['1540'],
    authority: 'Saju Bridge + Security',
    impact: 'Nonce-proof replay table, RLS and transport proof roles',
    release: 'SEPARATE_SAJU_SOURCE_SECURITY_REVIEW_REQUIRED',
  },
  {
    id: 'P3_SEYEON_AI_COST_GOVERNOR',
    versions: [...tens(1550,1650), ...tens(1670,1710)],
    authority: 'Character Memory + AI Cost + Security',
    impact: 'AI cost ledger, governor budget admission/settlement, role, provider receipt queue',
    release: 'SEPARATE_AI_COST_RUNTIME_CREDENTIAL_REVIEW_REQUIRED',
  },
  {
    id: 'P4_DORMANT_READER_DISCOVERY',
    versions: ['1660','1720'],
    authority: 'Reader Product + DB',
    impact: 'Reader existing-thread locator and Product scope read bridge',
    release: 'READER_POLICY_AND_DATA_MINIMIZATION_REVIEW_REQUIRED',
  },
  {
    id: 'P5_PRIVATE_READER_LOCKS_AND_D2',
    versions: tens(1740,1820),
    authority: 'Commerce + DB + Security',
    impact: 'Private Product/Reading locking, D1 first/additional issuer, D2 bind writer',
    release: 'NO_PRODUCTION_ISSUER_CREDENTIAL_OR_RUNTIME_ACTIVATION',
  },
  {
    id: 'P6_PRIVATE_CANCEL_AND_WRITER_ACL',
    versions: tens(1830,1900),
    authority: 'Commerce Payment + DB + Security',
    impact: 'Cancellation/revocation private writers and review, legacy/public writer EXECUTE closure',
    release: 'NO_LIVE_REFUND_REVOKE_OR_WORKER_CUTOVER',
  },
  {
    id: 'P7_PRIVATE_CANCEL_OPERATIONS',
    versions: tens(1910,1960),
    authority: 'Commerce Operations + DB + Security',
    impact: 'Cancel inbox/worker, ops review, alerts, dual-approval and transient retry',
    release: 'NO_OPERATIONAL_CANCEL_QUEUE_OR_ALERT_ACTIVATION',
  },
  {
    id: 'P8_MINIMAL_APPROVED_READ',
    versions: ['1970'],
    authority: 'Commerce + DB + Security + Privacy',
    impact: 'SECURITY DEFINER minimal Receipt observation function; API EXECUTE only',
    release: 'APPROVED_DESIGN_BUT_LIVE_DEPENDENCY_AND_RELEASE_GATES_UNSATISFIED',
  },
]);

const fileVersion = (name) => name.split('_')[0];

function sqlSignals(raw) {
  const sql = raw.replace(/--[^\r\n]*/gu, '');
  const test = expression => expression.test(sql);
  return Object.freeze({
    createTable: test(/\bcreate\s+table\b/iu),
    alterTable: test(/\balter\s+table\b/iu),
    defineFunction: test(/\bcreate\s+(?:or\s+replace\s+)?function\b/iu),
    securityDefiner: test(/\bsecurity\s+definer\b/iu),
    createRole: test(/\bcreate\s+role\b/iu),
    changeOwner: test(/\bowner\s+to\b/iu),
    grant: test(/\bgrant\b/iu),
    revoke: test(/\brevoke\b/iu),
    createPolicy: test(/\bcreate\s+policy\b/iu),
    changeExistingFunction: test(/\bcreate\s+or\s+replace\s+function\b/iu),
    routineMayMutateRows: test(/\b(?:insert\s+into|update\s+[a-z_.]+|delete\s+from)\b/iu),
  });
}

/**
 * Read-only code-and-ledger review. SQL lexical signals are triage indicators,
 * NOT evidence that a dormant private function ran against production data.
 */
export function auditM119LiveHistory({
  root='supabase/migrations',
  snapshot,
}={}) {
  if (!snapshot || snapshot.schemaVersion !== 'm1-19-read-only-live-ledger-observation-v1' ||
      !Array.isArray(snapshot.ledgerVersions) ||
      !snapshot.recoveredLiveOnly || !snapshot.expectedAtObservation) {
    throw new Error('M1-19: exact read-only live-history evidence required');
  }
  const sourceNames = readdirSync(root)
    .filter(name => /^[0-9]{4,14}_.+\.sql$/u.test(name))
    .sort();
  const repoVersions=sourceNames.map(fileVersion);
  const versions=new Set(repoVersions);
  if (versions.size!==repoVersions.length) {
    throw new Error('M1-19: duplicate source migration versions; HALT');
  }
  const parity=evaluateOfficialReaderMigrationParityV1({
    repositoryVersions:repoVersions,
    installedVersions:snapshot.ledgerVersions,
  });
  const missing=sourceNames.filter(name=>parity.missingVersions.includes(fileVersion(name)));
  const byVersion=new Map();
  for(const wave of M119_IMPACT_WAVES) {
    for(const version of wave.versions) {
      if(byVersion.has(version))throw new Error('M1-19: wave classification collision '+version);
      byVersion.set(version,wave);
    }
  }
  const classifications=missing.map(name=>{
    const version=fileVersion(name),wave=byVersion.get(version);
    if(!wave)throw new Error('M1-19: missing source migration has no owner wave: '+name);
    const raw=readFileSync(root+'/'+name,'utf8');
    return Object.freeze({
      version,
      file:name,
      wave:wave.id,
      owningReview:wave.authority,
      requiredReleaseGate:wave.release,
      readOnlySqlIndicators:sqlSignals(raw),
      separateOwnerReviewRequired:true,
      deploymentAuthorized:false,
    });
  });
  const unmapped=[...byVersion].filter(([version])=>!missing.some(name=>name.startsWith(version+'_')));
  if (unmapped.length) {
    throw new Error('M1-19: fixed wave manifest diverged from live observation: '+
      unmapped.map(([version])=>version).join(','));
  }

  const repair=snapshot.recoveredLiveOnly;
  const originalVersions=['1460','1470','1480','1490','1500','1510'];
  const overlayRelatedVersionsInstalled=originalVersions.every(version=>
    snapshot.ledgerVersions.includes(version));
  if (snapshot.expectedAtObservation.repositorySqlMigrations!==repoVersions.length ||
      snapshot.expectedAtObservation.liveInstalledVersions!==snapshot.ledgerVersions.length ||
      snapshot.expectedAtObservation.missingRepositoryVersions!==missing.length ||
      repair.version!=='20261008090417' ||
      parity.untrackedInstalledVersions.length!==1 ||
      parity.untrackedInstalledVersions[0]!==repair.version ||
      repair.functionNamesFromSource?.length!==19 ||
      repair.policyNamesFromSource?.length!==19) {
    throw new Error('M1-19: captured live SQL provenance counts or history changed; re-inspect before release');
  }
  const waveSummary=M119_IMPACT_WAVES.map(wave=>({
    id:wave.id,
    owningReview:wave.authority,
    impact:wave.impact,
    requiredReleaseGate:wave.release,
    count:classifications.filter(x=>x.wave===wave.id).length,
    versions:wave.versions,
    deployAuthorized:false,
  }));
  return Object.freeze({
    status:'HOLD_LIVE_REPAIR_OVERLAY_AND_45_CROSS_TRACK_MIGRATIONS',
    capturedAt:snapshot.observedDate,
    liveOnlyRecoverySql:{
      version:repair.version,
      name:repair.name,
      statementCount:repair.statementCount,
      statementLength:repair.sqlLengthCharacters,
      statementMd5:repair.md5,
      functionDefinitions:repair.observedFunctionDefinitions,
      functionOwnerChanges:repair.observedFunctionOwnerChanges,
      policiesCreated:repair.observedPoliciesCreated,
      original1460To1510HistoryPresent:overlayRelatedVersionsInstalled,
      exactSemanticEquivalenceToSourceCertified:false,
      deploymentActorIdentified:false,
      sqlSource:'original SQL retained in live Supabase migration history; no privileged replay',
    },
    parity:{
      repoCount:parity.repositoryCount,
      installedCount:parity.installedCount,
      missingCount:parity.missingCount,
      liveOnlyCount:parity.untrackedInstalledCount,
      liveOnlyVersions:parity.untrackedInstalledVersions,
    },
    waves:waveSummary,
    missingMigrations:classifications,
    cutoverSequence:[
      'Recover and peer-review live-only 104021-character SQL against repo 1460..1510 and current function/ACL catalogs, without executing it',
      'Review account-deletion finalizer 1520 and separate cross-track 1530..1720 DDL/role effects on a throwaway PG17 baseline',
      'Stage private D1/D2 1740..1820 with original lock, transactional replay and runtime Writer deny gates',
      'Stage 1830..1900 cancellation and legacy Writer closure independently; never activate live refund/revoke',
      'Stage 1910..1960 private operations only after own migration impact approval, never as a hidden prerequisite',
      'Stage owner-approved minimal read 1970 LAST after prerequisite schema and ACL parity, validate actual API-only function EXECUTE',
      'Recheck fresh live ledger + catalog gates and independently approve a migration release plan, backup and rollback before live DDL',
    ],
    deploymentAuthorized:false,
    readFunctionProductionGrantAuthorized:false,
    privateIssuerEnabled:false,
    publicPaidReaderEnabled:false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const evidencePath=process.argv[2] ||
    'docs/architecture/evidence/M1_19_LIVE_MIGRATION_HISTORY_20261018.json';
  const snapshot=JSON.parse(readFileSync(evidencePath,'utf8'));
  const report=auditM119LiveHistory({snapshot});
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.status.startsWith('HOLD_')?3:0;
}
