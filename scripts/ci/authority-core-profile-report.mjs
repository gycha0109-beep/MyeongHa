import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const stageLine = /^AUTHORITY_CORE_STAGE stage=([a-z][a-z0-9-]*) duration_seconds=(\d+) total_seconds=(\d+)$/;
const caseLine = /^AUTHORITY_CORE_CASE db=(myeongha_[a-z0-9_]+) duration_seconds=(\d+)$/;

export function summarizeAuthorityProfile(log, { expectedCases = 38 } = {}) {
  if (typeof log !== 'string' || !Number.isSafeInteger(expectedCases) || expectedCases < 1) {
    throw new Error('Provide log text and a positive expected case count');
  }
  const stages = [];
  const cases = [];
  const errors = [];
  const seenCases = new Set();
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.replace(/^.*?Z\s+(?=AUTHORITY_CORE_(?:STAGE|CASE))/, '').trim();
    const s = stageLine.exec(line);
    const c = caseLine.exec(line);
    if (s) {
      stages.push({ name: s[1], seconds: Number(s[2]), total_seconds: Number(s[3]) });
    } else if (c) {
      if (seenCases.has(c[1])) errors.push('duplicate case ' + c[1]);
      seenCases.add(c[1]);
      cases.push({ name: c[1], seconds: Number(c[2]) });
    } else if (line.startsWith('AUTHORITY_CORE_STAGE') || line.startsWith('AUTHORITY_CORE_CASE')) {
      errors.push('malformed profile record');
    }
  }
  const stageNames = [
    'baseline-and-early-guards',
    'seyeon-governor-and-cost-races',
    'character-and-record-concurrency',
    'reader-and-grant-races',
    'remaining-authority-and-catalog',
  ];
  if (stages.length !== stageNames.length || stages.some((s, i) => s.name !== stageNames[i])) {
    errors.push('missing or reordered authority stages');
  }
  if (cases.length !== expectedCases) errors.push('expected ' + expectedCases + ' isolated cases, received ' + cases.length);
  if (stages.some((s, i) => !Number.isSafeInteger(s.seconds) || !Number.isSafeInteger(s.total_seconds)
    || s.total_seconds < s.seconds || (i > 0 && s.total_seconds !== stages[i - 1].total_seconds + s.seconds))) {
    errors.push('inconsistent stage durations');
  }
  if (cases.some(c => !Number.isSafeInteger(c.seconds))) errors.push('invalid case duration');
  const total = stages.at(-1)?.total_seconds ?? null;
  const ranked = [...cases].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  const seyeon = cases.filter(c => c.name.startsWith('myeongha_seyeon_'));
  return {
    valid: errors.length === 0,
    errors,
    complete_case_count: cases.length,
    expected_case_count: expectedCases,
    total_script_seconds: total,
    stage_durations: stages.map(s => ({
      ...s,
      share_percent: total === null || total === 0 ? null : Math.round(s.seconds * 1000 / total) / 10,
    })),
    seyeon_isolated_case_count: seyeon.length,
    seyeon_isolated_case_seconds_sum: seyeon.reduce((sum, c) => sum + c.seconds, 0),
    longest_cases: ranked.slice(0, 12),
    limitations: [
      'Stage labels are script execution spans, not fully isolated test groups; the seyeon stage includes adjacent guards.',
      'The sum of per-case rounded durations differs from wall time because other scripts and PostgreSQL setup also run.',
      'Integer Bash SECONDS values are coarse; compare multiple equivalent GitHub Actions runs before asserting improvements.',
      'The report reads historical logs only and does not alter locks, sleeps, test isolation or CI execution.',
    ],
  };
}

function main() {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    throw new Error('Usage: node scripts/ci/authority-core-profile-report.mjs PATH_TO_JOB_LOG');
  }
  const report = summarizeAuthorityProfile(readFileSync(path, 'utf8'));
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
