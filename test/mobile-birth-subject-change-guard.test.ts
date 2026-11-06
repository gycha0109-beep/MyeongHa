import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('native Birth form owner boundary', () => {
  it('discards private draft fields and date picker when the verified account changes', async () => {
    const screen = await readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('subscribeMobileSubjectCredentialChangesV1(() => {');
    for (const reset of [
      "setYear('')", "setMonth('')", "setDay('')",
      "setHour12('')", "setMinute('00')", "setDatePickerVisible(false)",
      "setCalendarType('solar')", "setSex('unspecified')", "setIsLeapMonth(false)",
      'setOwnerChanged(true)',
    ]) expect(screen).toContain(reset);
    expect(screen).toContain("if (focused.current) router.replace('/reading')");
    expect(screen).toContain("if (ownerChanged) {");
    expect(screen).toContain('ownerEpoch.current += 1');
    expect(screen).toContain('return () => {');
  });

  it('ignores old-account create and refresh results without changing server authority', async () => {
    const [screen, birthService] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/birth/mobile-birth-service.ts', import.meta.url), 'utf8'),
    ]);
    expect(screen).toContain('const epoch = ownerEpoch.current');
    expect(screen).toContain('if (!focused.current || ownerChangedRef.current || epoch !== ownerEpoch.current) return');
    expect(screen).toContain('await mobileBirthServiceV1.create(request)');
    expect(screen).toContain('await mobileBirthServiceV1.readCurrent()');
    expect(screen).toContain('buildMobileBirthProfileCreateRequestV1({');
    expect(screen).toContain('mobileBirthAuthoredErrorCopyV1(error, locale)');
    expect(birthService).toContain('withActiveBearer');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('fetch(');
  });

  it('continues to preserve a same-account unsaved form during pull refresh', async () => {
    const screen = await readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8');
    const refresh = screen.split('const refreshBirthStatus = useCallback(async () => {')[1]
      ?.split('const { refreshing, onRefresh }')[0] ?? '';
    expect(refresh).toContain('mobileBirthServiceV1.readCurrent()');
    expect(refresh).not.toContain('setYear(');
    expect(refresh).not.toContain('setMonth(');
    expect(refresh).not.toContain('setHour12(');
  });
});
