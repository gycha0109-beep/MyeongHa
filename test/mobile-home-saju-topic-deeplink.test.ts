import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  MOBILE_SAJU_TOPICS_V1,
  resolveMobileHomeSajuFocusV1,
} from '../apps/mobile/src/features/saju/mobile-saju-topic-catalog.js';

const src = async (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mobile Home featured Saju topics link into native Saju selector', () => {
  it('accepts only the three featured Home topics and keeps blocked subjects closed', () => {
    expect(['career','money','love'].map(resolveMobileHomeSajuFocusV1)).toEqual(['career','money','love']);
    for (const unsafe of [undefined, null, '', [], ['career'], 'general', 'year', 'family', 'business', 'temperament', 'compatibility', 'question-specific']) {
      expect(resolveMobileHomeSajuFocusV1(unsafe)).toBeNull();
    }
    for (const key of ['career','money','love']) {
      expect(MOBILE_SAJU_TOPICS_V1.find(t => t.key === key)?.availability.kind).toBe('preview');
    }
  });

  it('navigates Home reading cards to the Saju hub without triggering interpretation', async () => {
    const home = await src('apps/mobile/src/features/home/HomeComponents.tsx');
    const block = home.slice(home.indexOf('export function HomeReadingTopics'), home.indexOf('export function HomeCharacterPending'));
    expect(block).toContain("router.push('/reading')");
    expect(block).toContain("params: { topic: topic.key === 'wealth' ? 'money' : topic.key }");
    expect(block).toContain('accessibilityRole="button"');
    expect(block).not.toContain('sourceReadingText');
    expect(block).not.toContain('preview-reading');
    expect(block).not.toContain('mobileSajuPreviewServiceV1');
  });

  it('highlights the selected native topic but retains a separate explicit user action for reading', async () => {
    const [screen, selector, scene] = await Promise.all([
      src('apps/mobile/src/app/(tabs)/reading/index.tsx'),
      src('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      src('apps/mobile/src/app/reading/scene.tsx'),
    ]);
    expect(screen).toContain('resolveMobileHomeSajuFocusV1(requestedHomeTopic)');
    expect(screen).toContain('focusTopicKey={homeFocusTopic}');
    expect(selector).toContain("state.kind === 'idle' ? focusTopicKey : state.topic.key");
    expect(selector).toContain('onPress={() => selectTopic(topic)}');
    expect(selector).not.toContain('useEffect(() => void load(');
    expect(scene).toContain('resolveMobileSajuSceneAdmissionV1(readerId, topicKey)');
  });
});
