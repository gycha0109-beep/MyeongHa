// Se-yeon R2: immutable, fail-closed 1520..1720 inventory and review-unit planner.
// No database connections, Supabase CLI, migration repair, execution or approval.
// Watchtower-Track: ops
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_RE = /^(1[5-7][0-9]0)_[a-z0-9_]+\.sql$/u;
const SHA1_RE = /^[0-9a-f]{40}$/u;
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/u;
const units = Object.freeze([
  'deletion', 'character-artifact', 'saju-proof', 'cost-governor-foundation',
  'g1-memory-pin', 'governor-subject-lock', 'reader-locator',
  'governor-guest-receipt', 'reader-product-scope',
]);

function hold(reason) { throw new Error('HOLD_R2_' + reason); }
function assert(condition, reason) { if (!condition) hold(reason); }

export function gitBlobSha(contents) {
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}

function proofPresent(sql, proof) {
  // This is a bounded textual sanity test against immutable pinned SQL,
  // NOT a parser, runtime catalog proof, or Owner decision.
  const id = proof.name.split('.').join('[.]');
  const re = proof.kind === 'function'
    ? new RegExp('\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+' + id + '\\s*\\(', 'iu')
    : proof.kind === 'table'
      ? new RegExp('\\bcreate\\s+table\\s+' + id + '\\s*\\(', 'iu')
      : new RegExp('\\bcreate\\s+role\\s+' + id + '\\b', 'iu');
  return re.test(sql);
}

export function validateR2PendingInventory(root, manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'MANIFEST_NOT_OBJECT');
  assert(manifest.schemaVersion === 'seyeon-r2-forward-only-inventory-v1'
    && manifest.readOnly === true && manifest.drReady === false
    && manifest.authorizedForProduction === false, 'UNAUTHORIZED_PROMOTION');
  const scope = manifest.scope ?? {};
  assert(scope.first === 1520 && scope.last === 1720 && scope.step === 10
    && scope.expectedCount === 21 && scope.remoteOnlyVersion === '20261008090417',
  'UNEXPECTED_SCOPE');
  assert(JSON.stringify(manifest.reviewUnits) === JSON.stringify(units),
    'REVIEW_UNITS_CHANGED');
  assert(Array.isArray(manifest.migrations) && manifest.migrations.length === 21,
    'MIGRATION_CARDINALITY');

  const dir = join(root, 'supabase', 'migrations');
  const actual = readdirSync(dir).filter(f => /^(?:15[2-9]0|16[0-9]0|17[0-2]0)_/u.test(f) && f.endsWith('.sql')).sort();
  const expected = manifest.migrations.map(x => x.file).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), 'MIGRATION_DIRECTORY_DRIFT');
  assert(!readdirSync(dir).some(f => f.startsWith('20261008090417_')),
    'REMOTE_ONLY_VERSION_CHECKED_IN');

  const seen = new Set();
  const grouped = new Map();
  let previousUnit = -1;
  const entries = [];
  for (let i = 0; i < 21; i++) {
    const row = manifest.migrations[i];
    const expectedVersion = String(1520 + i * 10);
    assert(row && typeof row === 'object' && row.version === expectedVersion
      && row.file?.startsWith(expectedVersion + '_') && VERSION_RE.test(row.file)
      && SHA1_RE.test(row.blobSha), 'VERSION_OR_FILENAME_DRIFT');
    assert(!seen.has(row.version), 'DUPLICATE_VERSION');
    seen.add(row.version);
    assert(row.approval === 'HOLD_OWNER_REVIEW' && /^[a-z-]+$/u.test(row.owner),
      'APPROVAL_OR_OWNER_DRIFT');
    const unitIndex = units.indexOf(row.unit);
    assert(unitIndex >= previousUnit && unitIndex !== -1, 'REVIEW_UNIT_ORDER');
    previousUnit = unitIndex;
    assert(Array.isArray(row.requires)
      && row.requires.every(v => /^1[5-7][0-9]0$/u.test(v) && seen.has(v))
      && new Set(row.requires).size === row.requires.length, 'NON_FORWARD_DEPENDENCY');
    assert(row.proof && ['function', 'table', 'role'].includes(row.proof.kind)
      && typeof row.proof.name === 'string' && row.proof.name.length < 120
      && row.proof.name.split('.').every(part => SAFE_NAME.test(part)),
    'PROOF_FORMAT');
    const bytes = readFileSync(join(dir, row.file));
    assert(gitBlobSha(bytes) === row.blobSha, 'SQL_CONTENT_DRIFT_' + row.version);
    assert(proofPresent(bytes.toString('utf8'), row.proof), 'PROOF_OBJECT_MISSING_' + row.version);
    const summary = { version: row.version, unit: row.unit, owner: row.owner,
      requires: [...row.requires], proof: { ...row.proof }, approval: row.approval };
    entries.push(summary);
    if (!grouped.has(row.unit)) grouped.set(row.unit, []);
    grouped.get(row.unit).push(row.version);
  }
  // 1570 queries lifecycle_state/started, introduced by 1560 (not 1550).
  // Check the review plan's true runtime column dependency, never authorize migration.
  const stage1570 = manifest.migrations.find(row => row.version === '1570');
  assert(stage1570?.requires.includes('1550')
    && stage1570.requires.includes('1560'),
    '1570_MISSING_LIFECYCLE_DEPENDENCY');
  assert(readFileSync(join(dir, stage1570.file), 'utf8').includes('lifecycle_state')
    && readFileSync(join(dir, manifest.migrations.find(row => row.version === '1560').file), 'utf8')
      .includes('add column lifecycle_state'),
    '1570_LIFECYCLE_SOURCE_DRIFT');
  // 1670 resolves only via the governed executor role created by 1630.
  // Its checked-in source also commits its own transaction, so a surrounding
  // BEGIN/ROLLBACK is not a valid disposable PG17 rollback harness.
  const stage1670 = manifest.migrations.find(row => row.version === '1670');
  const src1670 = readFileSync(join(dir, stage1670.file), 'utf8');
  assert(stage1670.requires.includes('1630'), '1670_MISSING_GOVERNED_EXECUTOR_DEPENDENCY');
  assert(src1670.includes("rolname='myeongha_seyeon_governed_executor'")
    && src1670.includes('begin;') && src1670.includes('commit;'),
    '1670_TRANSACTION_BOUNDARY_OR_ROLE_DRIFT');
  assert(grouped.size === 9, 'REVIEW_UNIT_CARDINALITY');
  const reviewUnits = [...grouped].map(([unit, versions]) => ({
    unit, versions, start: versions[0], end: versions.at(-1),
    approval: 'HOLD_OWNER_REVIEW', executable: false,
  }));
  return {
    schemaVersion: 'seyeon-r2-forward-only-plan-v1',
    status: 'HOLD_OWNER_RECONCILIATION_REQUIRED',
    migrationCount: entries.length,
    reviewUnitCount: reviewUnits.length,
    readOnly: true,
    drReady: false,
    authorizedForProduction: false,
    remoteOnlyVersion: '20261008090417',
    reviewUnits,
    migrations: entries,
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const inventory = JSON.parse(readFileSync(
      join(root, 'scripts/operations/seyeon-r2-pending-migration-inventory.json'), 'utf8'));
    const plan = validateR2PendingInventory(root, inventory);
    console.log(JSON.stringify(plan));
  } catch (error) {
    console.error(String(error?.message ?? error).slice(0, 550));
    process.exitCode = 1;
  }
}
