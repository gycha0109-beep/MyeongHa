import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION = /^\d+$/u;
const SHA = /^[a-f0-9]{40}$/u;
const MIGRATION_FILE = /^supabase\/migrations\/(\d+)_(.+)\.sql$/u;

function indexCatalog(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw Error('Migration metadata is empty');
  const byVersion = new Map();
  const versionsByName = new Map();
  for (const row of rows) {
    if (!row || typeof row.version !== 'string' || !VERSION.test(row.version) ||
        !(row.name === null || (typeof row.name === 'string' && row.name.length > 0)) ||
        Object.keys(row).some(key => key !== 'name' && key !== 'version') ||
        byVersion.has(row.version)) {
      throw Error('Invalid or duplicate migration metadata');
    }
    byVersion.set(row.version, row.name);
    if (row.name !== null) {
      const versions = versionsByName.get(row.name) ?? [];
      versions.push(row.version);
      versionsByName.set(row.name, versions);
    }
  }
  return { byVersion, versionsByName };
}

function compareVersion(a, b) {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return a.localeCompare(b);
}

export function compareMigrationCatalogs(remoteRows, repositoryRows, mainSha) {
  if (typeof mainSha !== 'string' || !SHA.test(mainSha)) throw Error('Exact main SHA required');
  const remote = indexCatalog(remoteRows);
  const repository = indexCatalog(repositoryRows);
  const remoteVersions = [...remote.byVersion.keys()].sort(compareVersion);
  const repositoryVersions = [...repository.byVersion.keys()].sort(compareVersion);
  const remoteOnly = remoteVersions.filter(version => !repository.byVersion.has(version));
  const repositoryOnly = repositoryVersions.filter(version => !remote.byVersion.has(version));
  const matchingVersions = remoteVersions.filter(version => repository.byVersion.has(version));
  const sameVersionNameDiffers = matchingVersions.filter(version =>
    remote.byVersion.get(version) !== null && remote.byVersion.get(version) !== repository.byVersion.get(version));
  const sameNameDifferentVersion = [];
  for (const remoteVersion of remoteOnly) {
    const name = remote.byVersion.get(remoteVersion);
    const candidates = repository.versionsByName.get(name);
    if (remote.versionsByName.get(name)?.length === 1 && candidates?.length === 1 &&
        !remote.byVersion.has(candidates[0])) {
      sameNameDifferentVersion.push({ remoteVersion, repositoryVersion: candidates[0] });
    }
  }

  return {
    schema: 'myeongha-postgres-migration-metadata-comparison-v1',
    mainSha,
    remoteVersionCount: remoteVersions.length,
    repositoryVersionCount: repositoryVersions.length,
    latestRemoteVersion: remoteVersions.at(-1),
    latestRepositoryVersion: repositoryVersions.at(-1),
    remoteOnly,
    repositoryOnly,
    sameVersionNameDiffers,
    sameNameDifferentVersion,
    catalogStatus: remoteOnly.length || repositoryOnly.length || sameVersionNameDiffers.length
      ? 'DIFFERENCES_REQUIRE_REVIEW' : 'VERSION_CATALOG_MATCH',
    appliedSqlEquivalenceProven: false,
    hostedRestoreProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
  };
}

function readRepositoryCatalog(mainSha) {
  if (!SHA.test(mainSha)) throw Error('Exact main SHA required');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('merge-base', '--is-ancestor', mainSha, 'origin/main');
  return git('ls-tree', '-r', '--name-only', mainSha, '--', 'supabase/migrations')
    .split(/\r?\n/u).filter(path => path.endsWith('.sql')).map(path => {
      const migration = MIGRATION_FILE.exec(path);
      if (!migration) throw Error('Unrecognized repository migration filename');
      return { version: migration[1], name: migration[2] };
    });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [mainSha, remoteFile] = process.argv.slice(2);
    if (process.argv.length !== 4) throw Error('Expected main SHA and sanitized metadata file');
    const remote = JSON.parse(readFileSync(remoteFile, 'utf8'));
    console.log(JSON.stringify(compareMigrationCatalogs(remote, readRepositoryCatalog(mainSha), mainSha), null, 2));
  } catch {
    console.error('MIGRATION_CATALOG_COMPARISON: expected a verified <main-sha> and sanitized <metadata.json>');
    process.exitCode = 1;
  }
}
