import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Saju birth input web contract', () => {
  it('uses bounded numeric date segments instead of native expanded-year date input', async () => {
    const page = await readFile(new URL('../apps/web/src/reading/ReadingPage.tsx', import.meta.url), 'utf8');
    expect(page).not.toContain('id="saju-birth-date" type="date"');
    expect(page).toContain('id="saju-birth-year"');
    expect(page).toContain('maxLength={4}');
    expect(page).toContain('id="saju-birth-month"');
    expect(page).toContain('id="saju-birth-day"');
  });

  it('caps date segments and advances focus when the year reaches four digits', async () => {
    const script = await readFile(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8');
    expect(script).toContain("replace(/\\D/gu, '').slice(0, length)");
    expect(script).toContain('setupBirthDateSegment(year, 4, month)');
    expect(script).toContain('if (nextInput && normalized.length === length) nextInput.focus();');
    expect(script).toContain("if (yearText.length !== 4) throw new Error('출생 연도는 네 자리로 입력해 주세요.')");
  });

  it('does not reopen the create form after a registered profile hits a calculation outage', async () => {
    const script = (await readFile(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
    expect(script).toContain("setState('error', '출생정보는 저장되어 있습니다. 다시 입력하지 말고 계산 재시도 버튼으로 결과를 확인해 주세요.");
    expect(script).toContain("byId('saju-calculation-retry').addEventListener('click', () => void loadExistingSaju())");
    expect(script).toContain("if (profileCreated && error?.operation === 'saju-calculation')");
    expect(script).toContain("clearBirthSession();\n      setState('empty', '이전 세션의 생년월일 형식이 올바르지 않아 입력 상태를 초기화했습니다.");
  });
});
