import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mobile premium My and Records presentation', () => {
  it('keeps the correct account/session source and auth actions in My', async () => {
    const screen = await source('apps/mobile/src/app/(tabs)/my/index.tsx');
    const welcome = await source('apps/mobile/src/features/my/MyEditorialWelcome.tsx');
    expect(screen).toContain('useMobileMyV1');
    expect(screen).toContain('useMobileMemberAuthV1');
    expect(screen).toContain('<MyMemberAuthCard');
    expect(screen).toContain('<MyEditorialWelcome account={currentAccount} />');
    expect(screen).toContain("state.profile.kind === 'ready'");
    expect(welcome).toContain("account === 'member'");
    expect(welcome).toContain("account === 'guest'");
    expect(welcome).toContain('계정 상태 확인 중');
    expect(welcome).not.toContain('fetch(');
    expect(welcome).not.toContain('SecureStore');
    expect(screen).not.toContain('fetch(');
  });

  it('keeps genuine theme preference separate from pending settings', async () => {
    const components = await source('apps/mobile/src/features/my/MyComponents.tsx');
    const theme = components.slice(
      components.indexOf('function MyThemeSelector()'),
      components.indexOf('export function MyPendingSettings()'),
    );
    expect(theme).toContain("['light', 'dark']");
    expect(theme).toContain('accessibilityRole="radio"');
    expect(theme).toContain('onPress={() => setTheme(option)}');
    expect(theme).toContain('themeSection');
    const pending = components.slice(
      components.indexOf('export function MyPendingSettings()'),
      components.indexOf('const styles = StyleSheet.create'),
    );
    expect(pending).toContain('<MyThemeSelector />');
    expect(pending).toContain('준비 중');
    expect(pending).not.toContain('<Pressable');
    expect(components).toContain("router.push('/birth')");
    expect(components).toContain('기존 계정으로 로그인');
  });

  it('counts only loaded and visible rows rather than guessing the archive total', async () => {
    const screen = await source('apps/mobile/src/app/(tabs)/records/index.tsx');
    const header = await source('apps/mobile/src/features/records/RecordsEditorialHeader.tsx');
    expect(screen).toContain('visibleItems(tab, snapshots)');
    expect(screen).toContain('itemCount={initialLoading ? null : items.length}');
    expect(header).toContain("itemCount === null");
    expect(header).toContain("t('기록을 확인하는 중')");
    expect(header).toContain("t(tabLabels[selected])");
    expect(header).toContain('현재 불러온 기록');
    expect(screen).toContain('<RecordsTabs selected={tab} onSelect={setTab} />');
    expect(screen).toContain('failedCollectionLabelsV1');
    expect(screen).toContain('loadMore(tab)');
    expect(screen).not.toContain('fetch(');
  });

  it('does not change archive disclosure, revoke, or opening rules', async () => {
    const cards = await source('apps/mobile/src/features/records/RecordsComponents.tsx');
    expect(cards).toContain('readingIsArchiveOpenableV1(item.productResponseState)');
    expect(cards).toContain('revokedAt !== null');
    expect(cards).toContain('저장된 풀이 다시 읽기');
    expect(cards).not.toContain('JSON.stringify');
    expect(cards).not.toContain('valueJsonb');
    expect(cards).not.toContain('contentJsonb');
    expect(cards).toContain('minHeight: 48');
  });
});
