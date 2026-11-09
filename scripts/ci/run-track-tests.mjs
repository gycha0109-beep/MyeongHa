import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveWorkTrackPlan } from './work-track-plan.mjs';

const changed = readFileSync(process.argv[2], 'utf8').split(/\r?\n/u).filter(Boolean);
const plan = resolveWorkTrackPlan(changed, { eventName: process.env.GITHUB_EVENT_NAME });
const vitest = 'node_modules/vitest/vitest.mjs';
const run = (args) => execFileSync(process.execPath, [vitest, ...args], { stdio: 'inherit' });

if (plan.full) {
  run(['run']);
} else {
  // Static source/SQL/fixture assertions do not appear in Vite's import graph.
  // Select those that explicitly mention a changed path (or its filename).
  // Shared/CI changes still run the full suite through the plan above.
  const staticTests = [];
  const changedNames = changed.map((path) => path.replaceAll('\\', '/'));
  const changedBasenames = changedNames.map((path) => path.split('/').at(-1)).filter(Boolean);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.expo'].includes(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)) {
        const source = readFileSync(path, 'utf8');
        if (/(?:readFile|readdir|execFile|execSync|spawnSync|node:fs|node:child_process)/u.test(source)
          && changedNames.some((changedPath, index) => source.includes(changedPath) || source.includes(changedBasenames[index]))) {
          staticTests.push(path);
        }
      }
    }
  }
  for (const directory of ['test', 'tests', 'apps', 'packages']) visit(directory);
  if (staticTests.length) run(['run', ...staticTests]);
  run(['related', ...changed, '--run', '--passWithNoTests']);
}
