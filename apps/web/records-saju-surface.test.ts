import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');

describe('Records Saju sample surface', () => {
  const html = readWeb('records.html');
  const page = readWeb('records-page.js');
  const css = readWeb('records-v2.css');

  it('keeps Saju reading records separate from Life Facts and other record domains', () => {
    expect(html).toContain('aria-controls="saju-records"');
    expect(html).toContain('id="saju-records-list"');
    expect(html).toContain('>사주 기록<');
    expect(html).toContain('사주 풀이 결과는 삶의 사실과 분리해 보관합니다.');
    expect(html).toContain('>현세록<');
    expect(html).toContain('>명식록<');
    expect(html).toContain('>대리자 기억<');
  });

  it('recognizes only the explicit sample fixture contract and removes it from the Life Fact ledger', () => {
    expect(page).toContain("const SAMPLE_SAJU_FACT_TYPE = 'sample_saju_reading_result';");
    expect(page).toContain("const SAMPLE_SAJU_SCHEMA_VERSION = 'sample.v1';");
    expect(page).toContain('fact.valueJsonb.sample === true');
    expect(page).toContain("requireArray(payload, 'facts').filter((fact) => !isSampleSajuReadingFact(fact))");
    expect(page).toContain("requireArray(payload, 'facts').filter(isSampleSajuReadingFact)");
  });

  it('renders the fixture as an honest product card instead of raw JSON or a fake score', () => {
    expect(page).toContain("records-reading-card records-reading-card--sample");
    expect(page).toContain("records-reading-badge', '개발 샘플'");
    expect(page).toContain('실제 Reading 저장 경로 연결 전 UI fixture');
    expect(page).toContain("link.href = 'reading.html';");
    expect(page).not.toContain('value.score');
    expect(page).not.toContain('점수');
    expect(css).toContain('.records-reading-card');
    expect(css).toContain('.records-reading-chip');
    expect(css).toContain('.records-reading-highlights');
  });
});
