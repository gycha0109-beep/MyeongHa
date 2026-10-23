import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  extractStaticUiSourceKeysV1,
  auditPlannedUiCopyKeysV1,
  auditCurrentPlannedUiCopyV1,
  classifyPlannedUiCopyOwnershipV1,
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

  it('respects protected owners and leaves unreviewed text pending', () => {
    const a = classifyPlannedUiCopyOwnershipV1(['홈','세연','갑','미심사 문구','홈'], ['홈','세연','갑']);
    expect(a.reviewedUiOwnedKeys).toEqual(['홈']);
    expect(a.characterOwnedKeys).toEqual(['세연']);
    expect(a.sourceOwnedKeys).toEqual(['갑']);
    expect(a.pendingOwnerReviewKeys).toEqual(['미심사 문구']);
    expect(a.privateDynamicDataInspected).toBe(false);
    expect(a.readyForRelease).toBe(false);
    expect(Object.isFrozen(a.pendingOwnerReviewKeys)).toBe(true);
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
    expect(status.ownership.reviewedUiOwnedKeys).toContain('세계관 둘러보기');
    expect(status.ownership.characterOwnedKeys).toContain('세연');
    expect(status.ownership.sourceOwnedKeys).toContain('갑');
    expect(status.ownership.pendingOwnerReviewKeys).toContain('연결자와 함께 읽습니다.');
    expect(status.ownership.privateDynamicDataInspected).toBe(false);
    expect(status.ownership.readyForRelease).toBe(false);
    expect(
      status.ownership.reviewedUiOwnedKeys.length +
      status.ownership.characterOwnedKeys.length +
      status.ownership.sourceOwnedKeys.length +
      status.ownership.pendingOwnerReviewKeys.length,
    ).toBe(status.authoredKeys);
    expect(status.readyForRelease).toBe(false);
  });
});
