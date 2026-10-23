import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolveMobileSajuSceneAdmissionV1 } from '../apps/mobile/src/features/saju/mobile-saju-reader-scene.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('native Reader Saju preview scene admission and presentation', () => {
  it('allows only approved Seyeon preview topics', () => {
    expect(resolveMobileSajuSceneAdmissionV1('seyeon', 'temperament')?.readingText).toBe('전체 사주');
    expect(resolveMobileSajuSceneAdmissionV1('seyeon', 'career')?.readingText).toBe('직업운');
    for (const topic of ['year', 'month', 'family', 'compatibility', 'question-specific', 'unknown']) {
      expect(resolveMobileSajuSceneAdmissionV1('seyeon', topic)).toBeNull();
    }
    expect(resolveMobileSajuSceneAdmissionV1('baekheon', 'temperament')).toBeNull();
    expect(resolveMobileSajuSceneAdmissionV1('seyeon', undefined)).toBeNull();
  });

  it('animates into a held final Reader frame before exposing server-delivered steps', async () => {
    const scene = await source('apps/mobile/src/app/reading/scene.tsx');
    const saju = await source('apps/mobile/src/app/(tabs)/reading/index.tsx');
    expect(scene).toContain('Animated.sequence([');
    expect(scene).toContain('setIntroFinished(true)');
    expect(scene).toContain('!introFinished');
    expect(scene).toContain('mobileSajuPreviewServiceV1.read(admission.readingText)');
    expect(scene).toContain('result.kind === \'delivered\'');
    expect(scene).toContain('subscribeMobileSubjectCredentialChangesV1');
    expect(scene).toContain('이번 무료 프리뷰는 공식 Reading 기록으로 저장되지 않습니다');
    expect(scene).toContain("const opened = await openCharacter(admission.readerId)");
    expect(scene).toContain("router.replace(`/chat/${opened.threadId}`)");
    expect(scene).toContain("chatOpenState.access !== 'member'");
    expect(scene).toContain("로그인 후 세연과 대화하기");
    expect(scene).not.toContain("router.replace('/chat')");
    expect(scene).not.toContain("router.push('/chat')");
    expect(scene).toContain("router.replace('/records?tab=readings')");
    expect(saju).toContain('onOpenPreview=');
  });
});
