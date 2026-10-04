import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePrGates } from './pr-gate-router.mjs';
import { resolveDbPrRouting } from './db-pr-router.mjs';
import { resolveWorkTrackPlan } from './work-track-plan.mjs';

export function resolveVerificationPlan(inputPaths, event = {}) {
  const paths = [...new Set(inputPaths.map(path => path.trim()).filter(Boolean))];
  const web = resolvePrGates(paths);
  const work = resolveWorkTrackPlan(paths, event);
  const db = resolveDbPrRouting(paths);
  return {
    ...web,
    track: work.track,
    web: work.web,
    mobile: work.mobile,
    unit_full: work.full,
    browser: ['chat', 'saju', 'records', 'profile', 'full'].some(key => web[key]),
    contracts: paths.some(path => /^(?:\.github\/workflows\/|\.github\/dependabot\.yml$|\.github\/[^/]+\.trigger$|scripts\/|docs\/|supabase\/migrations\/|test\/db\/|package(?:-lock)?\.json$)/u.test(path)),
    dependencies: paths.some(path => /^(?:\.github\/workflows\/|\.github\/dependabot\.yml$|package(?:-lock)?\.json$|(?:apps|packages)\/[^/]+\/package\.json$)/u.test(path)),
    db_suites: db.suites,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(0, 'utf8').split(/\r?\n/u);
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const plan = resolveVerificationPlan(paths, { ...event, eventName: process.env.GITHUB_EVENT_NAME });
  for (const [key, value] of Object.entries(plan)) {
    process.stdout.write(`${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`);
  }
}
