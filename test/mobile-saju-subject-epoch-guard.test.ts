import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Saju native Subject boundary for Birth and calculated facts', () => {
  it('clears the previous profile on verified account change and invalidates late loads', async () => {
    const source = await readFile(new URL('../apps/mobile/src/app/(tabs)/reading/index.tsx', import.meta.url), 'utf8');
    expect(source).toContain('subscribeMobileSubjectCredentialChangesV1(() => {');
    expect(source).toContain('const epoch = ++requestEpoch.current;');
    expect(source).toContain("setState({ kind: 'loading' })");
    expect(source).toContain('if (focused.current && epoch === requestEpoch.current) setState(next)');
    expect(source).toContain('unsubscribe()');
    expect(source).toContain('requestEpoch.current += 1');
    expect(source).toContain('focused.current = false');
    expect(source).not.toContain('setState(\n      await loadMobileCurrentSajuV1(');
  });

  it('preserves server-owned Saju facts, five-language Birth labels and unpaid Reader holds', async () => {
    const [screen, loader, birth, preview] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/reading/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/mobile-saju-loader.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/mobile-saju-birth-display.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/SajuPreviewReadingView.tsx', import.meta.url), 'utf8'),
    ]);
    expect(screen).toContain('mobileBirthServiceV1');
    expect(screen).toContain('mobileSajuServiceV1');
    expect(screen).toContain('createMobileSajuViewModelV1');
    expect(screen).toContain('BirthSummaryCard');
    expect(screen).toContain('SajuPillarGrid');
    expect(screen).toContain('mobileSajuErrorCopyV1(state.kind, locale)');
    expect(screen).toContain('MobileReaderPicker');
    expect(screen).toContain('useMobilePullRefreshV1(load)');
    expect(loader).toContain("kind: 'authority_mismatch'");
    expect(birth).toContain('projectMobileSajuBirthFactsV1');
    expect(preview).toContain('SajuReportStructurePreview');
    expect(screen).not.toContain('interpretationAuthorized: true');
    expect(screen).not.toContain('fetch(');
  });
});
