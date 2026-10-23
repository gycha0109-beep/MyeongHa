import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  extractStaticUiSourceKeysV1,
  auditPlannedUiCopyKeysV1,
  auditCurrentPlannedUiCopyV1,
} from '../scripts/i18n/planned-ui-copy-coverage-v1.mjs';

describe('I18N-07 non-authorizing English and Simplified Chinese UI gap audit', () => {
  it('parses only fixed authored UI tables and rejects malformed inputs', () => {
    expect(extractStaticUiSourceKeysV1(
      'prefix const COPY = new Map([["홈","ホーム","首頁"],["홈","ホーム","首頁"]].map(([source, japanese, traditionalChinese])',
      'const COPY = new Map(', ']].map(([source, japanese, traditionalChinese])',
    )).toEqual(['홈']);
    expect(() => extractStaticUiSourceKeysV1('missing', 'const COPY = new Map(', 'END'))
      .toThrow(/Missing authored UI table start/);
    expect(() => extractStaticUiSourceKeysV1('const COPY = new Map([[1,2,3]]END', 'const COPY = new Map(', ']]END'))
      .toThrow(/Unexpected authored UI row structure/);
  });

  it('returns distinct covered and missing Korean static UI keys, never release approval', () => {
    const status = auditPlannedUiCopyKeysV1(
      ['홈', '사주', '홈'], ['읽기', '사주'], ['홈', '읽기', 'not-in-source'],
    );
    expect(status.authoredKeys).toBe(3);
    expect(status.stagedKeysWithinAuthoredCatalog).toBe(2);
    expect(status.unclassifiedOrUnauthoredKeys).toEqual(['사주']);
    expect(status.readyForRelease).toBe(false);
    expect(Object.isFrozen(status)).toBe(true);
    expect(Object.isFrozen(status.unclassifiedOrUnauthoredKeys)).toBe(true);
  });

  it('audits actual current web and native static catalogues without translating source data', async () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const status = await auditCurrentPlannedUiCopyV1(root);
    expect(status.authoredKeys).toBeGreaterThan(100);
    expect(status.stagedKeysWithinAuthoredCatalog).toBeGreaterThan(0);
    expect(status.unclassifiedOrUnauthoredKeys.length).toBeGreaterThan(0);
    expect(status.unclassifiedOrUnauthoredKeys).toContain('세계관 둘러보기');
    expect(status.unclassifiedOrUnauthoredKeys).not.toContain('홈');
    expect(status.authoredKeys).toBe(
      status.stagedKeysWithinAuthoredCatalog + status.unclassifiedOrUnauthoredKeys.length,
    );
    expect(status.readyForRelease).toBe(false);
  });
});
