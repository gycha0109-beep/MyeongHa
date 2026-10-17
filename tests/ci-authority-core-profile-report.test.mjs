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
});
