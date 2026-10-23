import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile premium chat and Saju presentation', () => {
  it('shows only verified birth chart fields and no fictional fortunes', async () => {
    const hero = await source('apps/mobile/src/features/saju/SajuEditorialSummary.tsx');
    const screen = await source('apps/mobile/src/app/(tabs)/reading/index.tsx');
    expect(hero).toContain('viewModel.dayMaster');
    expect(hero).toContain("day.status === 'resolved'");
    expect(hero).toContain('viewModel.completeness.headline');
    expect(hero).toContain('하루 운세나 미래를 예측한 내용이 아닙니다');
    expect(hero).not.toContain('fetch(');
    expect(hero).not.toContain('useEffect');
    expect(screen).toContain('<SajuEditorialSummary viewModel={viewModel} />');
    expect(screen).toContain('<SajuPreviewReadingView');
    expect(screen).toContain('<SajuPillarGrid pillars={viewModel.pillars} />');
    expect(screen).toContain('loadMobileCurrentSajuV1');
  });

  it('retains the exact character portrait and reading HOLD while improving contrast', async () => {
    const room = await source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx');
    const ui = await source('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    expect(room).toContain('seyeon-chat-theme-mobile-v1.webp');
    expect(room).toContain('seyeonThemeWashDark');
    expect(room).toContain('<ChatReadMessages snapshot={snapshot} />');
    expect(room).toContain('<ChatComposer');
    expect(ui).toContain('resolveMobileChatPortraitV1(snapshot.characterId)');
    expect(ui).toContain('THE CONVERSATION');
    expect(ui).toContain("theme === 'dark' ? styles.seyeonBubbleDark : styles.seyeonBubble");
    expect(ui).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(ui).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(ui).toContain('개인정보 보호를 위한 서버 확인이 끝나지 않아');
    expect(ui).not.toContain('실시간 대화');
  });

  it('preserves product blocked topic rules and readable labels', async () => {
    const reading = await source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx');
    expect(reading).toContain("availability.kind === 'preview'");
    expect(reading).toContain('다른 주제의 풀이로 자동 대체하지 않습니다.');
    expect(reading).toContain('궁금한 주제를 선택해 더 깊이 살펴보세요');
    expect(reading).toContain('onOpenPreview(topic)');
    expect(reading).not.toContain('fetch(');
  });
});
