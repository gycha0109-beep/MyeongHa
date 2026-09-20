import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DOMAIN_KEYS = Object.freeze(['chat', 'saju', 'records', 'profile', 'full', 'db']);

const matches = (path, patterns) => patterns.some((pattern) => pattern.test(path));

const chatPatterns = [
  /^apps\/web\/chat(?:[-.]|\.html$)/u,
  /^apps\/web\/conversation-/u,
  /^apps\/web\/src\/(?:chat|chat-hub)\//u,
  /^apps\/web\/seyeon-chat\.webp$/u,
  /^scripts\/(?:run|verify)-web-(?:chat|conversation)/u,
];

const sajuPatterns = [
  /^apps\/web\/reading(?:[-.]|\.html$)/u,
  /^apps\/web\/saju-/u,
  /^apps\/web\/src\/(?:reading|reading-detail)\//u,
  /^apps\/web\/(?:reading-character\.js|baekheon-reading-scene\.jpg)$/u,
  /^scripts\/(?:run|verify)-web-(?:saju|reading)/u,
];

const recordsPatterns = [
  /^apps\/web\/records(?:[-.]|\.html$)/u,
  /^apps\/web\/src\/records\//u,
  /^scripts\/(?:run|verify)-web-records/u,
];

const profilePatterns = [
  /^apps\/web\/(?:my|birth)(?:[-.]|\.html$)/u,
  /^apps\/web\/src\/(?:my|birth)\//u,
  /^scripts\/(?:run|verify)-web-(?:my|birth)/u,
];

const knownFullPatterns = [
  /^apps\/web\/(?:app\.js|api-envelope\.js|styles\.css|index\.html)$/u,
  /^apps\/web\/product-/u,
  /^apps\/web\/auth(?:[-.]|\.html$)/u,
  /^apps\/web\/src\/auth\//u,
  /^apps\/web\/(?:hall\.html|home-|landing-|golden-master)/u,
  /^apps\/web\/src\/(?:home|landing)\//u,
  /^apps\/web\/assets\/characters\//u,
  /^apps\/web\/(?:package\.json|tsconfig\.json|vite\.config\.ts)$/u,
  /^scripts\/build-web-static\.mjs$/u,
  /^scripts\/(?:run|verify)-web-auth/u,
  /^scripts\/verify-web-browser-render\.mjs$/u,
  /^scripts\/verify-golden-master-header-browser\.mjs$/u,
  /^package(?:-lock)?\.json$/u,
  /^tsconfig(?:\.[^.]+)?\.json$/u,
  /^vercel\.json$/u,
  /^\.github\/workflows\/web-pr-domain-gates\.yml$/u,
  /^scripts\/ci\/pr-gate-router\.mjs$/u,
];

const dbPatterns = [
  /^supabase\/migrations\//u,
  /^test\/db\//u,
  /^test\/account-deletion-worker-runtime-postgres\.e2e\.test\.ts$/u,
  /^apps\/api\/src\/(?:account-deletion-worker-|node-postgres-account-deletion-worker-pool\.ts$|postgres-account-deletion-worker\.ts$|production-account-deletion-worker-)/u,
  /^package(?:-lock)?\.json$/u,
  /^\.github\/workflows\/ci\.yml$/u,
  /^scripts\/ci\/pr-gate-router\.mjs$/u,
];

const isWebRelevant = (path) =>
  path.startsWith('apps/web/')
  || /^scripts\/(?:run|verify)-web-/u.test(path)
  || path === 'scripts/build-web-static.mjs'
  || /^(?:package(?:-lock)?\.json|tsconfig(?:\.[^.]+)?\.json|vercel\.json)$/u.test(path)
  || path === '.github/workflows/web-pr-domain-gates.yml'
  || path === 'scripts/ci/pr-gate-router.mjs';

export function resolvePrGates(inputPaths) {
  const paths = [...new Set(inputPaths.map((path) => path.trim()).filter(Boolean))];
  const gates = Object.fromEntries(DOMAIN_KEYS.map((key) => [key, false]));

  for (const path of paths) {
    if (matches(path, dbPatterns)) gates.db = true;
    if (!isWebRelevant(path)) continue;

    if (matches(path, knownFullPatterns)) {
      gates.full = true;
      continue;
    }

    let classified = false;
    for (const [key, patterns] of [
      ['chat', chatPatterns],
      ['saju', sajuPatterns],
      ['records', recordsPatterns],
      ['profile', profilePatterns],
    ]) {
      if (matches(path, patterns)) {
        gates[key] = true;
        classified = true;
      }
    }

    // Fail-safe for future surfaces: an unclassified web-affecting file gets
    // the full browser regression until it is intentionally mapped.
    if (!classified) gates.full = true;
  }

  if (gates.full) {
    gates.chat = false;
    gates.saju = false;
    gates.records = false;
    gates.profile = false;
  }

  return gates;
}

function main() {
  const input = readFileSync(0, 'utf8').split(/\r?\n/u);
  const gates = resolvePrGates(input);
  for (const key of DOMAIN_KEYS) {
    process.stdout.write(`${key}=${gates[key] ? 'true' : 'false'}\n`);
  }
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) main();
