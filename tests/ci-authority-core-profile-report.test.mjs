import { describe, expect, it } from 'vitest';
import { summarizeAuthorityProfile } from '../scripts/ci/authority-core-profile-report.mjs';

const names = [
  'baseline-and-early-guards',
  'seyeon-governor-and-cost-races',
  'character-and-record-concurrency',
  'reader-and-grant-races',
  'remaining-authority-and-catalog',
];
const sample = (durations = [37, 116, 46, 53, 15]) => {
  let total = 0;
  return [
    ...durations.map((seconds, index) => {
      total += seconds;
      return '2026-10-17T08:00:00Z AUTHORITY_CORE_STAGE stage=' + names[index]
        + ' duration_seconds=' + seconds + ' total_seconds=' + total;
    }),
    '2026-10-17T08:01:00Z AUTHORITY_CORE_CASE db=myeongha_seyeon_d4a_test duration_seconds=10',
    '2026-10-17T08:01:01Z AUTHORITY_CORE_CASE db=myeongha_reader_test duration_seconds=13',
  ].join('\n');
};

describe('authority core read-only profile report', () => {
  it('reconstructs stage shares and expensive cases from timestamp-prefixed CI logs', () => {
    const r = summarizeAuthorityProfile(sample(), { expectedCases: 2 });
    expect(r.valid).toBe(true);
    expect(r.total_script_seconds).toBe(267);
    expect(r.stage_durations[1]).toEqual({
      name: 'seyeon-governor-and-cost-races',
      seconds: 116,
      total_seconds: 153,
      share_percent: 43.4,
    });
    expect(r.longest_cases[0].name).toBe('myeongha_reader_test');
    expect(r.seyeon_isolated_case_seconds_sum).toBe(10);
  });
  it('fails closed when incomplete rather than claiming 38 cases were covered', () => {
    const r = summarizeAuthorityProfile(sample());
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('expected 38 isolated cases, received 2');
  });
  it('rejects inconsistent totals, duplicate cases, malformed records and stage omissions', () => {
    const invalid = sample([37, 116, 46, 53, 15])
      .replace('total_seconds=153', 'total_seconds=150')
      + '\nAUTHORITY_CORE_CASE db=myeongha_reader_test duration_seconds=13'
      + '\nAUTHORITY_CORE_CASE invalid';
    const r = summarizeAuthorityProfile(invalid, { expectedCases: 3 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('inconsistent stage durations');
    expect(r.errors).toContain('duplicate case myeongha_reader_test');
    expect(r.errors).toContain('malformed profile record');
    expect(summarizeAuthorityProfile(sample().replace(/AUTHORITY_CORE_STAGE stage=remaining-authority-and-catalog[^\n]+/, ''), { expectedCases: 2 }).valid).toBe(false);
  });
  it('does not interpret arbitrary free text as new profiling evidence', () => {
    const log = sample() + '\nsome unrelated line with AUTHORITY_CORE_CASE db=myeongha_fake duration_seconds=999';
    expect(summarizeAuthorityProfile(log, { expectedCases: 2 }).complete_case_count).toBe(2);
  });

  it('reads complete high-resolution DB preparation, command and cleanup costs', () => {
    const detailed = sample() + '\n' + [
      '2026-10-17T08:02:00Z AUTHORITY_CORE_TEMPLATE source=created create_ms=100 migrate_ms=2000',
      '2026-10-17T08:02:01Z AUTHORITY_CORE_PHASE db=myeongha_seyeon_d4a_test pre_drop_ms=10 clone_ms=400 command_ms=8100 cleanup_ms=250',
      '2026-10-17T08:02:02Z AUTHORITY_CORE_PHASE db=myeongha_reader_test pre_drop_ms=15 clone_ms=450 command_ms=10900 cleanup_ms=260',
    ].join('\n');
    const result = summarizeAuthorityProfile(detailed, { expectedCases: 2 });
    expect(result.valid).toBe(true);
    expect(result.phase_detail_available).toBe(true);
    expect(result.phase_breakdown).toEqual({
      template: { source: 'created', create_ms: 100, migrate_ms: 2000 },
      isolated_case_count: 2,
      pre_drop_ms_sum: 25,
      clone_ms_sum: 850,
      command_ms_sum: 19000,
      cleanup_ms_sum: 510,
    });
  });

  it('keeps older complete logs valid without inventing a phase breakdown', () => {
    const result = summarizeAuthorityProfile(sample(), { expectedCases: 2 });
    expect(result.valid).toBe(true);
    expect(result.phase_detail_available).toBe(false);
    expect(result.phase_breakdown).toBe(null);
  });

  it('rejects missing, duplicate, mismatched, malformed or non-finite phase evidence', () => {
    const template = '\nAUTHORITY_CORE_TEMPLATE source=created create_ms=1 migrate_ms=4';
    const first = '\nAUTHORITY_CORE_PHASE db=myeongha_seyeon_d4a_test pre_drop_ms=1 clone_ms=2 command_ms=3 cleanup_ms=4';
    const second = '\nAUTHORITY_CORE_PHASE db=myeongha_reader_test pre_drop_ms=1 clone_ms=2 command_ms=3 cleanup_ms=4';
    expect(summarizeAuthorityProfile(sample() + template + first, { expectedCases: 2 }).valid).toBe(false);
    expect(summarizeAuthorityProfile(sample() + template + first + first, { expectedCases: 2 }).errors).toContain('duplicate phase myeongha_seyeon_d4a_test');
    expect(summarizeAuthorityProfile(sample() + template + second + first, { expectedCases: 2 }).valid).toBe(false);
    expect(summarizeAuthorityProfile(sample() + template + first + second + '\nAUTHORITY_CORE_PHASE bad', { expectedCases: 2 }).valid).toBe(false);
    expect(summarizeAuthorityProfile(sample() + template + first + second + template, { expectedCases: 2 }).valid).toBe(false);
    expect(summarizeAuthorityProfile(sample() + template + first + second.replace('command_ms=3', 'command_ms=99999999999999999'), { expectedCases: 2 }).valid).toBe(false);
    expect(summarizeAuthorityProfile(sample() + template.replace('created create_ms=1', 'existing create_ms=1') + first + second, { expectedCases: 2 }).valid).toBe(false);
  });

  it('accepts complete 38/5 historical and 39/6 new preflight logs, with no arbitrary missing case', () => {
    const historic = [
      'baseline-and-early-guards', 'seyeon-governor-and-cost-races',
      'character-and-record-concurrency', 'reader-and-grant-races',
      'remaining-authority-and-catalog',
    ];
    const next = [historic[0], 'seyeon-r1-positive-pin-isolated', ...historic.slice(1)];
    const fixture = (names, count) => {
      let total = 0;
      const stageLines = names.map((name) => {
        total += 1;
        return 'AUTHORITY_CORE_STAGE stage=' + name + ' duration_seconds=1 total_seconds=' + total;
      });
      const caseLines = Array.from({ length: count }, (_, i) =>
        'AUTHORITY_CORE_CASE db=myeongha_fixture_' + i + ' duration_seconds=1');
      return [...stageLines, ...caseLines].join('\\n');
    };
    expect(summarizeAuthorityProfile(fixture(historic, 38)).valid).toBe(true);
    const updated = summarizeAuthorityProfile(fixture(next, 39));
    expect(updated.valid).toBe(true);
    expect(updated.expected_case_count).toBe(39);
    expect(updated.stage_durations).toHaveLength(6);
    expect(summarizeAuthorityProfile(fixture(next, 38)).valid).toBe(false);
    expect(summarizeAuthorityProfile(fixture(historic, 39)).valid).toBe(false);
    expect(summarizeAuthorityProfile(fixture(next.toReversed(), 39)).valid).toBe(false);

    const detailed = fixture(next, 39) +
      '\\nAUTHORITY_CORE_TEMPLATE source=created create_ms=1 migrate_ms=2' +
      Array.from({ length: 39 }, (_, i) =>
        '\\nAUTHORITY_CORE_PHASE db=myeongha_fixture_' + i +
        ' pre_drop_ms=1 clone_ms=2 command_ms=3 cleanup_ms=4').join('');
    expect(summarizeAuthorityProfile(detailed).valid).toBe(true);
    expect(summarizeAuthorityProfile(detailed.replace(/AUTHORITY_CORE_PHASE db=myeongha_fixture_38[^\\n]*$/, '')).valid).toBe(false);
  });
});
