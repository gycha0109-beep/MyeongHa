import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string) {
  return readFile(new URL(`../apps/mobile/src/${path}`, import.meta.url), 'utf8');
}

describe('pull to refresh is available across the app without destroying state', () => {
  it('shares a guarded native RefreshControl across the 4 MobileScreen-driven surfaces', async () => {
    const shared = await source('ui/MobileScreen.tsx');
    expect(shared).toContain('RefreshControl');
    expect(shared).toContain('refreshing={refreshing}');
    expect(shared).toContain('onRefresh={onRefresh}');

    for (const route of [
      'app/(tabs)/my/index.tsx',
      'app/(tabs)/reading/index.tsx',
      'app/(tabs)/reading/face.tsx',
      'app/(tabs)/chat/index.tsx',
    ]) {
      const screen = await source(route);
      expect(screen, route).toContain('useMobilePullRefreshV1');
      expect(screen, route).toContain('onRefresh={() => void onRefresh()}');
      expect(screen, route).toContain('refreshing={refreshing}');
    }
  });

  it('supports pull refresh on home, records, chat history, archived readings and birth form', async () => {
    const routes = [
      'app/(tabs)/index.tsx',
      'app/(tabs)/records/index.tsx',
      'app/(tabs)/chat/[threadId].tsx',
      'app/reading/[readingId].tsx',
      'app/birth/index.tsx',
    ];
    for (const route of routes) {
      const screen = await source(route);
      expect(screen, route).toContain('RefreshControl');
      expect(screen, route).toContain('onRefresh=');
    }
  });

  it('reruns server reads, preserves unsent text and checks current records subject epoch', async () => {
    const records = await source('features/records/use-mobile-records.tsx');
    expect(records).toContain('loadInitialAll({ force: true })');
    expect(records).toContain('epoch === focusEpoch.current');

    const chat = await source('features/chat/use-mobile-chat-thread.tsx');
    expect(chat).toContain('const refresh = useCallback(async () => {');
    expect(chat).toContain('if (sendingRef.current) return;');
    expect(chat).toContain('controller.loadInitial()');
    const refreshPart = chat.split('const refresh = useCallback(async () => {')[1]?.split('const loadMore =')[0] ?? '';
    expect(refreshPart).not.toContain('setDraft(');
    expect(refreshPart).not.toContain('pendingTurn.current =');

    const birth = await source('app/birth/index.tsx');
    expect(birth).toContain('mobileBirthServiceV1.readCurrent()');
    const birthRefresh = birth.split('const refreshBirthStatus = useCallback(async () => {')[1]?.split('const chooseCalendar')[0] ?? '';
    expect(birthRefresh).not.toContain('setYear(');
    expect(birthRefresh).not.toContain('setMonth(');
    expect(birthRefresh).not.toContain('setDay(');
  });

  it('clears pending OAuth only on an external browser return without callback', async () => {
    const auth = await source('features/my/use-mobile-member-auth.tsx');
    expect(auth).toContain("AppState.addEventListener('change'");
    expect(auth).toContain("AppState.addEventListener('blur'");
    expect(auth).toContain("AppState.addEventListener('focus'");
    expect(auth).toContain('mayCancelOnReturn(attempt)');
    expect(auth).toContain('nativeMobileSocialAuthServiceV1.cancelPending()');
    expect(auth).toContain('socialReturnGate.current.callback()');
    expect(auth).toContain('clearResumeCancelTimer()');
  });
});
