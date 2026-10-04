import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationPlan } from './verification-plan.mjs';

const checks = JSON.parse(readFileSync(new URL('./web-pr-checks.json', import.meta.url), 'utf8'));
export function selectWebChecks(plan) {
  const selected = plan.full ? ['full'] : ['chat', 'saju', 'records', 'profile'].filter(key => plan[key]);
  return [...new Set(selected.flatMap(key => checks[key]))];
}

export function runWebChecks(scripts, execute = (script) => execFileSync(process.execPath, [script], { stdio: 'inherit' })) {
  const failures = [];
  for (const script of scripts) {
    if (!/^scripts\/[a-z0-9-]+\.mjs$/u.test(script)) throw new Error(`Invalid browser verifier path: ${script}`);
    console.log(`::group::${script}`);
    try { execute(script); } catch { failures.push(script); }
    console.log('::endgroup::');
  }
  if (failures.length) throw new Error(`Selected browser checks failed: ${failures.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(process.argv[2], 'utf8').split(/\r?\n/u);
  runWebChecks(selectWebChecks(resolveVerificationPlan(paths)));
}
