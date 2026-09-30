import { describe, expect, it } from 'vitest';

import {
  CharacterFactRegistryCompilerErrorV1,
  compileCharacterFactRegistryFromBibleV1,
} from './fact-registry-compiler-v1.js';

const bible = `
# Character

# FACT AUTHORITY & BIOGRAPHY CLOSURE APPENDIX

| fact_key | value / policy | source authority | Character knowledge | disclosure default | source | closure note |
|---|---|---|---|---|---|---|
| \`identity.name\` | 세연 | \`CANON\` | \`KNOWN\` | \`PUBLIC\` | B1 | 채택 |
| \`past_romance.existence\` | 과거 연애 경험 있음 | \`CANON\` | \`KNOWN\` | \`FAMILIAR\` | J4 | 세부 상대·시기·종료 이유는 AUTHOR_UNDEFINED |
| \`backstory.birth_or_growth_region\` | 미정 | \`AUTHOR_UNDEFINED\` | \`NOT_APPLICABLE\` | \`NOT_APPLICABLE\` | J1 | 생활권 이동 가설은 HYPOTHESIS이며 authority 아님 |
| \`principle_calling.binding\` | 별도 World authority | \`WORLD_DEPENDENT\` | \`NOT_APPLICABLE\` | \`NOT_APPLICABLE\` | World/Principle-Calling | 미정 유지 |

## Closure Rule
`;

describe('Character fact registry compiler v1', () => {
  it('compiles only the explicit appendix without inferring unresolved values', () => {
    const rows = compileCharacterFactRegistryFromBibleV1({
      characterId: 'seyeon',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'abc123',
      bibleMarkdown: bible,
    });

    expect(rows).toEqual([
      {
        characterId: 'seyeon',
        factKey: 'identity.name',
        sourceAuthority: 'CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'PUBLIC',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        value: '세연',
        closureNote: '채택',
      },
      {
        characterId: 'seyeon',
        factKey: 'past_romance.existence',
        sourceAuthority: 'CANON',
        characterKnowledge: 'KNOWN',
        disclosureDefault: 'FAMILIAR',
        sourceSection: 'J4',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        value: '과거 연애 경험 있음',
        closureNote: '세부 상대·시기·종료 이유는 AUTHOR_UNDEFINED',
      },
      {
        characterId: 'seyeon',
        factKey: 'backstory.birth_or_growth_region',
        sourceAuthority: 'AUTHOR_UNDEFINED',
        characterKnowledge: 'NOT_APPLICABLE',
        disclosureDefault: 'NOT_APPLICABLE',
        sourceSection: 'J1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        closureNote: '생활권 이동 가설은 HYPOTHESIS이며 authority 아님',
      },
      {
        characterId: 'seyeon',
        factKey: 'principle_calling.binding',
        sourceAuthority: 'WORLD_DEPENDENT',
        characterKnowledge: 'NOT_APPLICABLE',
        disclosureDefault: 'NOT_APPLICABLE',
        sourceSection: 'World/Principle-Calling',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        closureNote: '미정 유지',
      },
    ]);

    expect('value' in rows[2]!).toBe(false);
    expect('value' in rows[3]!).toBe(false);
  });

  it('preserves SOFT_CANON wording instead of interpreting it into a stronger fact', () => {
    const markdown = bible.replace(
      '| \`identity.name\` | 세연 | \`CANON\` | \`KNOWN\` | \`PUBLIC\` | B1 | 채택 |',
      '| \`identity.name\` | 과거 검사 ESFP / 현재 큰 관심 없음 | \`SOFT_CANON\` | \`KNOWN\` | \`CONTEXTUAL\` | B1 | 성격 원인으로 역추론 금지 |',
    );

    const [row] = compileCharacterFactRegistryFromBibleV1({
      characterId: 'seyeon',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'abc123',
      bibleMarkdown: markdown,
    });

    expect(row).toMatchObject({
      sourceAuthority: 'SOFT_CANON',
      value: '과거 검사 ESFP / 현재 큰 관심 없음',
      closureNote: '성격 원인으로 역추론 금지',
    });
  });

  it('fails closed on an unsupported appendix authority enum', () => {
    expect(() =>
      compileCharacterFactRegistryFromBibleV1({
        characterId: 'seyeon',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        bibleMarkdown: bible.replace('`CANON`', '`INVENTED`'),
      }),
    ).toThrow(CharacterFactRegistryCompilerErrorV1);
  });

  it('fails closed when duplicate fact keys appear', () => {
    const duplicate = bible.replace(
      '## Closure Rule',
      '| \`identity.name\` | duplicate | \`CANON\` | \`KNOWN\` | \`PUBLIC\` | B1 | duplicate |\n\n## Closure Rule',
    );

    expect(() =>
      compileCharacterFactRegistryFromBibleV1({
        characterId: 'seyeon',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'abc123',
        bibleMarkdown: duplicate,
      }),
    ).toThrow(/Duplicate Character fact key/u);
  });
});
