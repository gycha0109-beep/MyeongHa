import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Saju birth input web contract', () => {
  it('uses bounded numeric date segments instead of native expanded-year date input', async () => {
    const html = await readFile(new URL('../apps/web/reading.html', import.meta.url), 'utf8');
    expect(html).not.toContain('id="saju-birth-date" type="date"');
    expect(html).toContain('id="saju-birth-year"');
    expect(html).toContain('maxlength="4"');
    expect(html).toContain('id="saju-birth-month"');
    expect(html).toContain('id="saju-birth-day"');
  });

  it('caps date segments and advances focus when the year reaches four digits', async () => {
    const script = await readFile(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8');
    expect(script).toContain("replace(/\\D/gu, '').slice(0, length)");
    expect(script).toContain('setupBirthDateSegment(year, 4, month)');
    expect(script).toContain('if (nextInput && normalized.length === length) nextInput.focus();');
    expect(script).toContain("if (yearText.length !== 4) throw new Error('출생 연도는 네 자리로 입력해 주세요.')");
  });

  it('does not reopen the create form after a registered profile hits a calculation outage', async () => {
    const script = await readFile(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8');
    expect(script).toContain("setState('error', '출생정보는 등록되어 있지만 현재 사주 계산 서비스를 사용할 수 없습니다.");
    expect(script).toContain("if (profileCreated && error?.operation === 'saju-calculation')");
    expect(script).toContain("clearGuestBirthSession();\n      setState('empty', '이전 세션의 생년월일 형식이 올바르지 않아 입력 상태를 초기화했습니다.");
  });
});
