import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const stageLine = /^AUTHORITY_CORE_STAGE stage=([a-z][a-z0-9-]*) duration_seconds=(\d+) total_seconds=(\d+)$/;
const caseLine = /^AUTHORITY_CORE_CASE db=(myeongha_[a-z0-9_]+) duration_seconds=(\d+)(?: index=(\d+))?$/;
const templateLine = /^AUTHORITY_CORE_TEMPLATE source=(created|existing) create_ms=(\d+) migrate_ms=(\d+)$/;
const phaseLine = /^AUTHORITY_CORE_PHASE db=(myeongha_[a-z0-9_]+) pre_drop_ms=(\d+) clone_ms=(\d+) command_ms=(\d+) cleanup_ms=(\d+)(?: index=(\d+))?$/;

export function summarizeAuthorityProfile(log, { expectedCases } = {}) {
  if (typeof log !== 'string' || (expectedCases !== undefined && (!Number.isSafeInteger(expectedCases) || expectedCases < 1))) {
    throw new Error('Provide log text and a positive expected case count');
  }
  const stages = [];
  const cases = [];
  const templates = [];
  const phases = [];
  const errors = [];
  const seenCases = new Set();
  const seenPhases = new Set();
  const duplicateCases = [];
  const duplicatePhases = [];
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.replace(/^.*?Z\s+(?=AUTHORITY_CORE_(?:STAGE|CASE|TEMPLATE|PHASE))/, '').trim();
    const s = stageLine.exec(line);
    const c = caseLine.exec(line);
    const t = templateLine.exec(line);
    const p = phaseLine.exec(line);
    if (s) {
      stages.push({ name: s[1], seconds: Number(s[2]), total_seconds: Number(s[3]) });
    } else if (c) {
      if (seenCases.has(c[1])) duplicateCases.push(c[1]);
      seenCases.add(c[1]);
      cases.push({ name: c[1], seconds: Number(c[2]), ...(c[3] === undefined ? {} : { index: Number(c[3]) }) });
    } else if (t) {
      templates.push({ source: t[1], create_ms: Number(t[2]), migrate_ms: Number(t[3]) });
    } else if (p) {
      if (seenPhases.has(p[1])) duplicatePhases.push(p[1]);
      seenPhases.add(p[1]);
      phases.push({
        name: p[1], pre_drop_ms: Number(p[2]), clone_ms: Number(p[3]),
        command_ms: Number(p[4]), cleanup_ms: Number(p[5]),
        ...(p[6] === undefined ? {} : { index: Number(p[6]) }),
      });
    } else if (/^AUTHORITY_CORE_(?:STAGE|CASE|TEMPLATE|PHASE)/.test(line)) {
      errors.push('malformed profile record');
    }
  }
  // These are explicitly allowlisted versions of the authority-core coverage contract.
  // The new disposable R1 preflight adds a stage and a case; historical 38-case
  // logs must remain readable without accepting arbitrary incomplete case counts.
  const stageNames38 = [
    'baseline-and-early-guards',
    'seyeon-governor-and-cost-races',
    'character-and-record-concurrency',
    'reader-and-grant-races',
    'remaining-authority-and-catalog',
  ];
  const stageNames39 = [
    'baseline-and-early-guards',
    'seyeon-r1-positive-pin-isolated',
    ...stageNames38.slice(1),
  ];
  const matchesStages = (names) => stages.length === names.length
    && stages.every((stage, index) => stage.name === names[index]);
  const stageNames40 = [
    stageNames38[0], 'seyeon-r1-positive-pin-isolated',
    'seyeon-r2-actual-v2-isolated', ...stageNames38.slice(1),
  ];
  const version = matchesStages(stageNames40) ? 40
    : matchesStages(stageNames39) ? 39 : matchesStages(stageNames38) ? 38 : null;
  if (version === null) errors.push('missing or reordered authority stages');
  const resolvedExpectedCases = expectedCases === undefined ? (version ?? 39) : expectedCases;
  if (cases.length !== resolvedExpectedCases) errors.push('expected ' + resolvedExpectedCases + ' isolated cases, received ' + cases.length);
  // R2 intentionally starts a second fresh clone with the same exact PGDATABASE
  // that its R1 preflight requires. The profile index is observation-only;
  // neither case's disposable database name, SQL, locks or isolation changes.
  const deliberateR2Reuse = 'myeongha_seyeon_positive_pin_candidate_test';
  const repeated = version === 40 && cases[2]?.name === deliberateR2Reuse
    && cases[3]?.name === deliberateR2Reuse
    && phases.length === 40 && phases[2]?.name === deliberateR2Reuse
    && phases[3]?.name === deliberateR2Reuse
    && duplicateCases.length === 1 && duplicateCases[0] === deliberateR2Reuse
    && duplicatePhases.length === 1 && duplicatePhases[0] === deliberateR2Reuse;
  if (version === 40 && !repeated) errors.push('missing exact R1/R2 fresh-clone evidence');
  if (!repeated) {
    for (const name of duplicateCases) errors.push('duplicate case ' + name);
    for (const name of duplicatePhases) errors.push('duplicate phase ' + name);
  }
  const hasIndex = cases.some(c => c.index !== undefined) || phases.some(p => p.index !== undefined);
  if (version === 40 && !hasIndex) errors.push('40-case profile requires ordered invocation indexes');
  if (hasIndex) {
    if (cases.some((c, i) => c.index !== i + 1)) errors.push('missing or reordered case invocation indexes');
    if (phases.length > 0 && phases.some((p, i) => p.index !== cases[i]?.index)) {
      errors.push('missing or reordered phase invocation indexes');
    }
  }
  if (stages.some((s, i) => !Number.isSafeInteger(s.seconds) || !Number.isSafeInteger(s.total_seconds)
    || s.total_seconds < s.seconds || (i > 0 && s.total_seconds !== stages[i - 1].total_seconds + s.seconds))) {
    errors.push('inconsistent stage durations');
  }
  if (cases.some(c => !Number.isSafeInteger(c.seconds))) errors.push('invalid case duration');
  const detailed = templates.length > 0 || phases.length > 0;
  if (detailed) {
    if (templates.length !== 1) errors.push('expected one template timing record');
    if (phases.length !== resolvedExpectedCases || phases.some((p, i) => p.name !== cases[i]?.name)) {
      errors.push('missing or reordered isolated phase records');
    }
    if (templates.some(t => !Number.isSafeInteger(t.create_ms) || !Number.isSafeInteger(t.migrate_ms)
      || (t.source === 'existing' && (t.create_ms !== 0 || t.migrate_ms !== 0)))) {
      errors.push('inconsistent template timing');
    }
    if (phases.some(p => [p.pre_drop_ms, p.clone_ms, p.command_ms, p.cleanup_ms]
      .some(n => !Number.isSafeInteger(n)))) errors.push('invalid phase duration');
  }
  const phaseBreakdown = detailed && errors.length === 0 ? {
    template: templates[0],
    isolated_case_count: phases.length,
    pre_drop_ms_sum: phases.reduce((sum, p) => sum + p.pre_drop_ms, 0),
    clone_ms_sum: phases.reduce((sum, p) => sum + p.clone_ms, 0),
    command_ms_sum: phases.reduce((sum, p) => sum + p.command_ms, 0),
    cleanup_ms_sum: phases.reduce((sum, p) => sum + p.cleanup_ms, 0),
  } : null;
  const total = stages.at(-1)?.total_seconds ?? null;
  const ranked = [...cases].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  const seyeon = cases.filter(c => c.name.startsWith('myeongha_seyeon_'));
  return {
    valid: errors.length === 0,
    errors,
    complete_case_count: cases.length,
    expected_case_count: resolvedExpectedCases,
    phase_detail_available: detailed,
    phase_breakdown: phaseBreakdown,
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
      'The phase breakdown is unavailable for older logs without template and per-case phase records.',
      'A 40-case, 7-stage R2 run intentionally reuses the R1 disposable PostgreSQL name but requires two separately indexed fresh-clone observations.',
      'Per-case command time includes SQL locks, planned waits and test process startup; it is not pure PostgreSQL execution time.',
      'A reused pre-existing template is not comparable to a freshly created template without separate review.',
      'EPOCHREALTIME millisecond measurements do not include profiler output overhead and must not be equated with total CI wall time.',
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
