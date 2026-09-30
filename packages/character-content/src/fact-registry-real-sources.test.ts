import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FACT_REGISTRY_BIBLE_SOURCES_V1,
  compileRegisteredCharacterFactRegistrySourcesV1,
  flattenCompiledCharacterFactRegistrySourcesV1,
} from './fact-registry-source-manifest-v1.js';

const repoRoot = new URL('../../../', import.meta.url);

function compileRealSources() {
  return compileRegisteredCharacterFactRegistrySourcesV1({
    sourceReader: {
      readText(sourceBiblePath) {
        return readFileSync(new URL(sourceBiblePath, repoRoot), 'utf8');
      },
    },
  });
}

describe('reviewed Character Bible fact registry sources', () => {
  it('registers only the three reviewed detailed Bible documents', () => {
    expect(CHARACTER_FACT_REGISTRY_BIBLE_SOURCES_V1).toEqual([
      {
        characterId: 'seyeon',
        sourceBiblePath: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'v0.2',
      },
      {
        characterId: 'yeoul',
        sourceBiblePath: 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
        sourceBibleDocument: 'YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
        sourceBibleRevision: 'v0.3',
      },
      {
        characterId: 'rahyeon',
        sourceBiblePath: 'docs/character/RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md',
        sourceBibleDocument: 'RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md',
        sourceBibleRevision: 'v0.5',
      },
    ]);
  });

  it('compiles the real Fact Authority appendices without free-form prose inference', () => {
    const compiled = compileRealSources();
    const rows = flattenCompiledCharacterFactRegistrySourcesV1(compiled);

    expect(compiled.map((entry) => [
      entry.source.characterId,
      entry.rows.length,
    ])).toEqual([
      ['seyeon', 17],
      ['yeoul', 15],
      ['rahyeon', 15],
    ]);
    expect(rows).toHaveLength(47);

    const unresolved = rows.filter((row) =>
      row.sourceAuthority === 'AUTHOR_UNDEFINED' ||
      row.sourceAuthority === 'INTENTIONALLY_OPEN' ||
      row.sourceAuthority === 'WORLD_DEPENDENT'
    );
    expect(unresolved).toHaveLength(28);
    for (const row of unresolved) {
      expect('value' in row).toBe(false);
      expect(row.policy).toBeDefined();
    }

    expect(rows.some((row) => /principle|calling|oath/iu.test(row.factKey))).toBe(false);
  });

  it('exposes only seven currently live-safe PUBLIC facts across the three reviewed Bibles', () => {
    const rows = flattenCompiledCharacterFactRegistrySourcesV1(
      compileRealSources(),
    );
    const publicRows = rows.filter(
      (row) =>
        (row.sourceAuthority === 'CANON' || row.sourceAuthority === 'SOFT_CANON') &&
        row.characterKnowledge === 'KNOWN' &&
        row.disclosureDefault === 'PUBLIC',
    );

    expect(publicRows.map((row) => [
      row.characterId,
      row.factKey,
      row.sourceAuthority,
      row.value,
    ])).toEqual([
      ['seyeon', 'identity.name', 'CANON', '세연'],
      [
        'seyeon',
        'life.occupation_or_social_role',
        'CANON',
        '명하의 현직 대리자 / 첫 안내 소임 / 일반 Reader 가능',
      ],
      [
        'seyeon',
        'life.current_responsibilities',
        'CANON',
        '현직 대리자 / 신규 접촉자·방문자 첫 안내 소임',
      ],
      ['yeoul', 'identity.name', 'CANON', '여울'],
      ['yeoul', 'identity.age_band', 'SOFT_CANON', '성인 여성'],
      ['rahyeon', 'identity.name', 'CANON', '라현'],
      ['rahyeon', 'identity.age_band', 'SOFT_CANON', '30대 초반'],
    ]);
  });

  it('preserves Seyeon contextual biography as non-live-safe despite resolved Canon', () => {
    const rows = flattenCompiledCharacterFactRegistrySourcesV1(
      compileRealSources(),
    );
    const birthday = rows.find(
      (row) =>
        row.characterId === 'seyeon' &&
        row.factKey === 'identity.birthday',
    );
    const pastRomance = rows.find(
      (row) =>
        row.characterId === 'seyeon' &&
        row.factKey === 'past_romance.existence',
    );

    expect(birthday).toMatchObject({
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'CONTEXTUAL',
      value: '11월 3일',
    });
    expect(pastRomance).toMatchObject({
      sourceAuthority: 'CANON',
      characterKnowledge: 'KNOWN',
      disclosureDefault: 'FAMILIAR',
      value: '과거 연애 경험 있음',
    });
  });
});
