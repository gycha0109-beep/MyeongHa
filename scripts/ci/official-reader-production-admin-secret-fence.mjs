#!/usr/bin/env node
// D3e24: prevent reintroducing Supabase administrator DB passwords in the
// Vercel app/runtime code. An authorized migration workflow is separate.
// STATIC/OFFLINE only: cannot inspect Vercel dashboard values or deployed code.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ADMIN_PASSWORD_NAMES = Object.freeze([
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_DATABASE_PASSWORD',
  'POSTGRES_PASSWORD',
]);
const RUNTIME_ROOTS = Object.freeze([
  'api',
  'apps/api/src',
  'apps/admin/src',
  'apps/web',
  'apps/mobile',
  'packages',
]);
const SKIP_DIRS = new Set([
  '.git', '.next', '.vercel', '.expo', 'node_modules', 'dist', 'build',
  'coverage', 'vendor', '__tests__', 'test', 'tests', 'fixtures',
]);
const RUNTIME_EXTENSIONS = /\.(?:[cm]?[jt]sx?|json|html)$/u;
const TEST_FILE = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function walk(path, out) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(fullPath, out);
    } else if (entry.isFile()) {
      const relativePath = relative(ROOT, fullPath).split('\\').join('/');
      if (RUNTIME_EXTENSIONS.test(relativePath) && !TEST_FILE.test(relativePath)) {
        out.push(relativePath);
      }
    }
  }
}

export function inspectRuntimeSource(file, source) {
  const matches = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    for (const credentialName of ADMIN_PASSWORD_NAMES) {
      if (line.includes(credentialName)) {
        // Do not reproduce lines. A future accidental inline credential
        // MUST NEVER be copied into CI logs.
        matches.push({ file, line: index + 1, credentialName });
      }
    }
  }
  return matches;
}

export function inspectAdminPasswordSourceInventory(root = ROOT) {
  const files = ['vercel.json'];
  for (const location of RUNTIME_ROOTS) {
    try {
      const folder = resolve(root, location);
      walk(folder, files);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  const inspected = [...new Set(files)].sort();
  const issues = [];
  for (const file of inspected) {
    const source = readFileSync(resolve(root, file), 'utf8');
    issues.push(...inspectRuntimeSource(file, source));
  }
  return { inspected, issues };
}

function verifySeparation(root = ROOT) {
  const workflow = readFileSync(resolve(root, '.github/workflows/supabase-production.yml'), 'utf8');
  const migrationScript = readFileSync(
    resolve(root, 'scripts/operations/run-supabase-production-migrations.sh'), 'utf8',
  );
  if (!workflow.includes('secrets.SUPABASE_DB_PASSWORD')) {
    throw new Error('D3e24 HOLD: governed migration workflow no longer references its own GitHub Actions secret');
  }
  if (!migrationScript.includes('SUPABASE_DB_PASSWORD')) {
    throw new Error('D3e24 HOLD: migration script administrator credential contract unexpectedly changed');
  }

  // Require the pre-existing safe runtime design, without reading any secret.
  const config = readFileSync(
    resolve(root, 'apps/api/src/production-user-data-runtime-config.ts'), 'utf8',
  );
  const pool = readFileSync(
    resolve(root, 'apps/api/src/node-postgres-subject-pool.ts'), 'utf8',
  );
  if (!config.includes("databasePrincipal: 'MYEONGHA_DATABASE_PRINCIPAL'")) {
    throw new Error('D3e24 HOLD: dedicated application DB login name contract changed');
  }
  for (const token of ["'postgres'", "'supabase_admin'", "'service_role'"]) {
    if (!config.includes(token)) {
      throw new Error('D3e24 HOLD: privileged PostgreSQL login rejection contract changed');
    }
  }
  if (!pool.includes('current_user') || !pool.includes('canEnterExecutionRole')) {
    throw new Error('D3e24 HOLD: actual database principal/role runtime preflight changed');
  }
}

function selfTest() {
  const safeApp = inspectRuntimeSource('api/me.ts',
    "const x = process.env.MYEONGHA_DATABASE_PRINCIPAL;\n");
  if (safeApp.length) throw new Error('D3e24 self-test rejected ordinary runtime principal');
  for (const name of ADMIN_PASSWORD_NAMES) {
    const simple = inspectRuntimeSource('api/rogue.ts', 'process.env.' + name);
    const bracket = inspectRuntimeSource('apps/api/src/rogue.ts',
      'process.env["' + name + '"]');
    if (simple.length !== 1 || bracket.length !== 1 ||
        simple[0].credentialName !== name) {
      throw new Error('D3e24 self-test missed privileged credential import');
    }
  }
  if (inspectRuntimeSource('api/me.ts', 'hello\nconst x = process.env.POSTGRES_PASSWORD;')[0]?.line !== 2) {
    throw new Error('D3e24 self-test failed to preserve line number');
  }
  // Only source files in the runtime inventory are scanned. A distinct
  // GitHub Actions admin migration secret is NOT a Vercel runtime secret.
  console.log('PASS D3e24: admin-password runtime scanner catches 3 names, preserves safe principal');
}

function main() {
  selfTest();
  verifySeparation();
  const { inspected, issues } = inspectAdminPasswordSourceInventory();
  for (const issue of issues) {
    console.error('HOLD D3e24: admin DB password referenced by app: '
      + issue.file + ':' + issue.line + ' (' + issue.credentialName + ')');
  }
  if (issues.length) process.exitCode = 1;
  else console.log('PASS D3e24: ' + inspected.length
    + ' Vercel/runtime source files have no direct admin database password references');
  console.log('HOLD D3e24: offline code inventory is not live secret inventory, '
    + 'Data API key tier validation, or deployed-runtime proof');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
