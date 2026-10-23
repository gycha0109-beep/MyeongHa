import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  plannedMobileUiPreviewLocaleV1,
  previewMobileAuthoredUiLabelV1,
} from '../apps/mobile/src/ui/mobile-planned-ui-screen-preview-v1.js';

describe('I18N-07 Expo developer-only Saju UI preview boundary', () => {
  it('admits only one exact EN/CN preview param when development is true', () => {
    expect(plannedMobileUiPreviewLocaleV1('en-US', true)).toBe('en-US');
    expect(plannedMobileUiPreviewLocaleV1('zh-CN', true)).toBe('zh-CN');
    for (const input of [null, undefined, 'ko-KR', 'ja-JP', 'zh-TW',
      'en-GB', 'zh', ['en-US'], ['en-US','zh-CN']]) {
      expect(plannedMobileUiPreviewLocaleV1(input, true)).toBeNull();
    }
    expect(plannedMobileUiPreviewLocaleV1('en-US', false)).toBeNull();
    expect(plannedMobileUiPreviewLocaleV1('zh-CN', false)).toBeNull();
  });

  it('previews only already authored static labels and preserves fallback', () => {
    const activeTranslate = (literal: string) => 'active:' + literal;
    expect(previewMobileAuthoredUiLabelV1('사주', null, activeTranslate)).toBe('active:사주');
    expect(previewMobileAuthoredUiLabelV1('사주', 'en-US', activeTranslate)).toBe('Saju');
    expect(previewMobileAuthoredUiLabelV1('출생정보가 필요합니다', 'zh-CN', activeTranslate))
      .toBe('需要出生信息');
    expect(previewMobileAuthoredUiLabelV1('다시 시도', 'en-US', activeTranslate)).toBe('Try again');
    expect(previewMobileAuthoredUiLabelV1('USER_PRIVATE_MESSAGE', 'en-US', activeTranslate))
      .toBe('active:USER_PRIVATE_MESSAGE');
    expect(previewMobileAuthoredUiLabelV1('official.source.claim', 'zh-CN', activeTranslate))
      .toBe('active:official.source.claim');
  });

  it('keeps the actual Expo Saju route scoped to __DEV__ and authored labels', async () => {
    const source = await readFile(
      new URL('../apps/mobile/src/app/(tabs)/reading/index.tsx', import.meta.url), 'utf8',
    );
    expect(source).toContain('plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__)');
    expect(source).toContain("previewText('사주')");
    expect(source).toContain('previewText("출생정보가 필요합니다")');
    expect(source).toContain('previewText("현재 출생정보와 명식을 확인하는 중입니다…")');
    expect(source).toContain('loadMobileCurrentSajuV1({');
    expect(source).toContain('mobileSajuServiceV1');
    expect(source).toContain('createMobileSajuViewModelV1({');
    expect(source).toContain('SajuPillarGrid pillars={viewModel.pillars}');
    expect(source).toContain('router.push(\'/birth\')');
    expect(source).not.toContain('setLocale(');
    expect(source).not.toContain('X-MyeongHa-UI-Locale');
  });
  it('keeps Face and Chat Hub route previews strictly development-only and static', async () => {
    const [faceRoute, chatRoute] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/reading/face.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/index.tsx', import.meta.url), 'utf8'),
    ]);
    for (const source of [faceRoute, chatRoute]) {
      expect(source).toContain('plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__)');
      expect(source).not.toContain('setLocale(');
      expect(source).not.toContain('X-MyeongHa-UI-Locale');
    }
    expect(faceRoute).toContain('previewText(\'관상\')');
    expect(faceRoute).toContain('previewText("사진을 준비해 주세요")');
    expect(faceRoute).toContain('previewText("전면 카메라로 정면 사진 촬영")');
    expect(faceRoute).toContain("source={{ uri: ready.uri }}");
    expect(faceRoute).toContain("message: result.reason");
    expect(faceRoute).toContain('pickMobileFaceMediaFromLibraryV1');
    expect(chatRoute).toContain('previewText(\'대화\')');
    expect(chatRoute).toContain('previewText("로그인 후 대화하기  →")');
    expect(chatRoute).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    expect(chatRoute).toContain('character.displayName');
    expect(chatRoute).toContain('state.errorMessage');
    expect(chatRoute).toContain('openCharacter(characterId)');
    const tr = (source: string) => 'active:' + source;
    expect(previewMobileAuthoredUiLabelV1('관상', 'en-US', tr)).toBe('Face reading');
    expect(previewMobileAuthoredUiLabelV1('사진을 준비해 주세요', 'zh-CN', tr)).toBe('请准备照片');
    expect(previewMobileAuthoredUiLabelV1('대화', 'en-US', tr)).toBe('Chat');
    expect(previewMobileAuthoredUiLabelV1('로그인 후 대화하기  →', 'zh-CN', tr)).toBe('登录后对话 →');
    expect(previewMobileAuthoredUiLabelV1('관상', null, tr)).toBe('active:관상');
  });

  it('previews authored My account UI only in Expo development and retains credentials unchanged', async () => {
    const [myRoute, editorial, myComponents] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/my/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/my/MyEditorialWelcome.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/my/MyComponents.tsx', import.meta.url), 'utf8'),
    ]);
    expect(myRoute).toContain('plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__)');
    expect(myRoute).toContain("title={previewText('마이')}");
    expect(myRoute).toContain('previewLocale={previewLocale}');
    expect(editorial).toContain("previewText('나의 이야기를')");
    expect(editorial).toContain('previewText(accountStatus)');
    expect(myComponents).toContain("previewText('이메일')");
    expect(myComponents).toContain("previewText('비밀번호')");
    expect(myComponents).toContain('previewText(socialPendingProvider === provider ?');
    expect(myComponents).toContain('previewText(pending ?');
    expect(myRoute).toContain('memberAuth.signIn(email, password)');
    expect(myRoute).toContain('memberAuth.signUp(email, password)');
    expect(myRoute).toContain('memberAuth.completeSignUp(');
    expect(myRoute).toContain('nativeMobileRuntimeV1.memberSession.read()');
    expect(myRoute).toContain('errorMessage={');
    expect(myComponents).toContain('value={password}');
    expect(myComponents).toContain('value={email}');
    expect(myComponents).toContain('>{errorMessage}</Text>');
    expect(myComponents).toContain('{verificationRequired.email}');
    expect(myComponents).toContain('{verificationRequired.message}');
    expect(myComponents).toContain('onPress={onSignOut}');
    expect(myComponents).toContain('<MyLocaleSelector />');
    for (const source of [myRoute, editorial, myComponents]) {
      expect(source).not.toContain('X-MyeongHa-UI-Locale');
    }
    const active = (source: string) => 'active:' + source;
    expect(previewMobileAuthoredUiLabelV1('마이', 'en-US', active)).toBe('My Page');
    expect(previewMobileAuthoredUiLabelV1('계정으로 이어가기', 'zh-CN', active)).toBe('使用账户继续');
    expect(previewMobileAuthoredUiLabelV1('이 기기에서는 회원 세션을 우선 사용합니다.', 'en-US', active))
      .toBe('The member session takes precedence on this device.');
    expect(previewMobileAuthoredUiLabelV1('나의 이야기를', 'en-US', active)).toBe('My story');
    expect(previewMobileAuthoredUiLabelV1('마이', null, active)).toBe('active:마이');
    expect(plannedMobileUiPreviewLocaleV1('en-US', false)).toBeNull();
  });

});
