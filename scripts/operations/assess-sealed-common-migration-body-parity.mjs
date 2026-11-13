// Compare hash-verified sealed Provider SQL statement bytes to the exact
// checked-out main migration files. No historical SQL, actor, or credentials
// may leave the disposable runner. This never executes or repairs migrations.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const sha40 = /^[a-f0-9]{40}$/u;
const sha64 = /^[a-f0-9]{64}$/u;
const filePattern = /^supabase\/migrations\/([0-9]+)_([^/\r\n]+)\.sql$/u;
const maxSqlBytes = 16 * 1024 * 1024;

function asMigrationFile(path) {
  assert.equal(typeof path, 'string');
  const match = filePattern.exec(path);
  assert.ok(match, 'Unexpected main migration path');
  return { path, version: match[1], name: match[2] };
}

function classForSource(statements, repoBytes) {
  if (statements === null || statements.length === 0) {
    return { classification: 'SOURCE_STATEMENTS_ABSENT' };
  }
  assert.ok(Array.isArray(statements) && statements.length <= 1024);
  assert.ok(statements.every(x => x === null || typeof x === 'string'));
  if (statements.some(x => x === null)) {
    return { classification: 'SOURCE_STATEMENTS_PARTIAL_NULL' };
  }
  if (statements.length > 1) {
    // A reconstructed statement array is NOT an original executed SQL file.
    // It cannot establish byte-exact equivalence to the repository script.
    const candidate = Buffer.from(statements.join(';\n\n') + ';');
    return {
      classification: candidate.equals(repoBytes)
        ? 'MULTI_STATEMENT_RECONSTRUCTED_MATCH_UNPROVEN'
        : 'MULTI_STATEMENT_SOURCE_FRAMING_UNPROVEN',
    };
  }
  const sourceBytes = Buffer.from(statements[0], 'utf8');
  assert.ok(sourceBytes.length <= maxSqlBytes);
  return {
    classification: sourceBytes.equals(repoBytes)
      ? 'SINGLE_STATEMENT_BYTE_EXACT'
      : 'SINGLE_STATEMENT_BYTES_DIFFER',
    sourceStatementSha256: sha256(sourceBytes),
    sourceStatementBytes: sourceBytes.length,
    repositoryFileSha256: sha256(repoBytes),
    repositoryFileBytes: repoBytes.length,
  };
}

export function assessSealedCommonMigrationBodyParity({
  sourcePacket, sourceBytes, pairedProof, lineage, repositoryEntries,
  repositoryCommitSha,
}) {
  assert.match(repositoryCommitSha, sha40);
  assert.ok(Buffer.isBuffer(sourceBytes) && sourceBytes.length > 0 &&
    sourceBytes.length <= 64 * 1024 * 1024);
  assert.equal(sourcePacket?.schemaVersion, 'ops-provider-migration-sealed-source-v1');
  assert.ok(Array.isArray(sourcePacket.entries) && sourcePacket.entries.length > 0);
  assert.equal(sourcePacket.allVersionCount, sourcePacket.entries.length);
  assert.equal(sourcePacket.numericVersionCount, sourcePacket.entries.length);
  assert.match(sourcePacket.catalogSha256, sha64);
  assert.equal(pairedProof?.schemaVersion,
    'ops-paired-provider-ledger-source-recovery-v1');
  assert.equal(pairedProof.encryptedSourceDecryptionVerified, true);
  assert.equal(pairedProof.originalHistoryPayloadIntegrityVerified, true);
  assert.equal(pairedProof.sourcePacketSha256, sha256(sourceBytes));
  assert.equal(pairedProof.migrationCount, sourcePacket.entries.length);
  assert.equal(pairedProof.migrationFrontier, sourcePacket.migrationFrontier);
  assert.equal(pairedProof.migrationCatalogSha256, sourcePacket.catalogSha256);
  assert.equal(pairedProof.providerMigrationLedgerRestored, false);
  assert.equal(pairedProof.drReady, false);
  assert.equal(pairedProof.serviceResumptionAllowed, false);
  assert.match(pairedProof.backupSourceSha, sha40);

  assert.equal(lineage?.schemaVersion, 'ops-sealed-provider-migration-file-lineage-v1');
  assert.equal(lineage.currentRepositoryCommitSha, repositoryCommitSha);
  assert.equal(lineage.sourceBackupRunId, pairedProof.backupRunId);
  assert.equal(lineage.sourcePacketSha256, pairedProof.sourcePacketSha256);
  assert.equal(lineage.sourceMigrationCatalogSha256, pairedProof.migrationCatalogSha256);
  assert.equal(lineage.sourceMigrationFrontier, pairedProof.migrationFrontier);
  assert.equal(lineage.sourceVersionCount, pairedProof.migrationCount);
  assert.equal(lineage.originalSqlBodiesPublished, false);
  assert.equal(lineage.sourceLedgerHistoryRowsRestored, false);
  assert.equal(lineage.migrationHistoryRepaired, false);
  assert.equal(lineage.drReady, false);
  assert.equal(lineage.serviceResumptionAllowed, false);

  const sourceByVersion = new Map();
  for (const entry of sourcePacket.entries) {
    assert.match(entry.version, /^[0-9]+$/u);
    assert.ok(!sourceByVersion.has(entry.version));
    sourceByVersion.set(entry.version, entry);
  }
  assert.ok(Array.isArray(repositoryEntries) &&
    repositoryEntries.length === lineage.currentRepositoryFileCount);
  const repositoryByVersion = new Map();
  for (const entry of repositoryEntries) {
    const file = asMigrationFile(entry.path);
    assert.ok(Buffer.isBuffer(entry.bytes));
    assert.ok(entry.bytes.length > 0 && entry.bytes.length <= maxSqlBytes);
    assert.ok(!repositoryByVersion.has(file.version),
      'Duplicate main migration version');
    repositoryByVersion.set(file.version, { ...file, bytes: entry.bytes });
  }
  const remoteOnly = [...sourceByVersion.keys()].filter(
    v => !repositoryByVersion.has(v)).sort();
  const repositoryOnly = [...repositoryByVersion.keys()].filter(
    v => !sourceByVersion.has(v)).sort();
  assert.deepEqual(remoteOnly, lineage.remoteOnlyVersionIds);
  assert.deepEqual(repositoryOnly, lineage.repositoryOnlyVersionIds);
  assert.equal(sourceByVersion.size - remoteOnly.length,
    lineage.commonVersionCount);
  const classified = [];
  for (const [version, source] of sourceByVersion) {
    const repo = repositoryByVersion.get(version);
    if (!repo) continue;
    if (source.name !== repo.name) {
      classified.push({ version, classification: 'SAME_VERSION_NAME_MISMATCH' });
      continue;
    }
    const found = classForSource(source.statements, repo.bytes);
    classified.push({ version, ...found });
  }
  assert.equal(classified.length, lineage.commonVersionCount);
  const classes = [...new Set(classified.map(x => x.classification))];
  const counts = Object.fromEntries(classes.map(k => [
    k, classified.filter(x => x.classification === k).length,
  ]));
  const exact = classified.filter(x =>
    x.classification === 'SINGLE_STATEMENT_BYTE_EXACT');
  const nonexact = classified.filter(x =>
    x.classification !== 'SINGLE_STATEMENT_BYTE_EXACT');
  const diagnostic = nonexact.map(x => x.classification ===
    'SINGLE_STATEMENT_BYTES_DIFFER'
    ? x : { version: x.version, classification: x.classification });
  assert.equal(exact.length + diagnostic.length, lineage.commonVersionCount);
  return {
    schemaVersion: 'ops-sealed-common-migration-body-parity-v1',
    sourceBackupRunId: pairedProof.backupRunId,
    sourceBackupSourceSha: pairedProof.backupSourceSha,
    sourcePacketSha256: pairedProof.sourcePacketSha256,
    sourceMigrationCatalogSha256: pairedProof.migrationCatalogSha256,
    sourceVersionCount: pairedProof.migrationCount,
    sourceMigrationFrontier: pairedProof.migrationFrontier,
    exactRepositoryCommitSha: repositoryCommitSha,
    repositoryFileCount: lineage.currentRepositoryFileCount,
    commonVersionCount: lineage.commonVersionCount,
    remoteOnlyVersionCount: remoteOnly.length,
    repositoryOnlyVersionCount: repositoryOnly.length,
    sourceMissingStatementBodyCount: pairedProof.sourceStatementBodiesMissingCount,
    byteExactSingleStatementCount: exact.length,
    notByteExactOrUnprovenCount: diagnostic.length,
    classifications: counts,
    nonExactOrUnprovenVersions: diagnostic,
    sourceSqlStatementsPublished: false,
    sourceOperatorMetadataPublished: false,
    multipleStatementReconstructionPromotedToExact: false,
    migrationHistoryReplayed: false,
    migrationHistoryRepaired: false,
    executionCausalityProven: false,
    appliedSqlAndCurrentDdlEquivalenceProven: false,
    restoredProviderMigrationLedgerProven: false,
    fullHostedProviderRecoveryProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'SAME_VERSION_SOURCE_BODY_COMPARISON_OBSERVED__DR_HOLD',
  };
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const sha = process.env.GITHUB_SHA;
  assert.match(sha, sha40);
  const git = (...args) => execFileSync('git', args, {
    encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: maxSqlBytes, timeout: 20_000,
  });
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), sha);
  const root = resolve(process.env.RUNNER_TEMP ?? '.');
  assert.notEqual(root, resolve('.'));
  const args = process.argv.slice(2);
  const arg = name => {
    const i = args.indexOf(name);
    assert.ok(i >= 0 && args[i+1] && !args[i+1].startsWith('--'));
    const result = resolve(args[i+1]);
    assert.ok(result.startsWith(root+sep));
    return result;
  };
  const sourceBytes = await readFile(arg('--source'));
  const sourcePacket = JSON.parse(sourceBytes.toString('utf8'));
  const [pairedProof, lineage] = await Promise.all([
    readFile(arg('--paired-proof'), 'utf8').then(JSON.parse),
    readFile(arg('--lineage'), 'utf8').then(JSON.parse),
  ]);
  const paths = git('ls-tree', '-r', '--name-only', sha, '--',
    'supabase/migrations').toString('utf8')
    .trim().split(/\r?\n/u).filter(path => path.endsWith('.sql'));
  const sourceIds = new Set(sourcePacket.entries.map(x => x.version));
  const entries = paths.map(path => {
    const file = asMigrationFile(path);
    return { path, bytes: sourceIds.has(file.version)
      ? git('show', sha+':'+path) : Buffer.from([0x20]) };
  });
  // Source-only versions are not read; for repo-only versions, a nonempty
  // sentinel suffices because their contents are outside this comparison.
  const result = assessSealedCommonMigrationBodyParity({
    sourcePacket,sourceBytes,pairedProof,lineage,
    repositoryEntries:entries,repositoryCommitSha:sha,
  });
  await writeFile(arg('--output'), JSON.stringify(result,null,2)+'\n',
    {flag:'wx',mode:0o600});
  process.stdout.write('COMMON_VERSION_SQL_BYTE_PARITY_OBSERVED DR_HOLD\n');
}

if (process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write('HOLD_COMMON_VERSION_SQL_BYTE_PARITY\n');
    process.exitCode=1;
  });
}
