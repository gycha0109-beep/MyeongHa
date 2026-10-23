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

  it('previews authored birth and records text in Expo only without touching source data', async () => {
    const [birthRoute, recordsRoute, recordsHeader] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/records/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/records/RecordsEditorialHeader.tsx', import.meta.url), 'utf8'),
    ]);
    for (const source of [birthRoute, recordsRoute]) {
      expect(source).toContain('plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__)');
      expect(source).not.toContain('X-MyeongHa-UI-Locale');
      expect(source).not.toContain('setLocale(');
    }
    expect(birthRoute).toContain('previewText("‹ 사주로 돌아가기")');
    expect(birthRoute).toContain('previewText("연도 → 월 → 날짜 순서로 선택할 수 있습니다.")');
    expect(birthRoute).toContain('buildMobileBirthProfileCreateRequestV1({');
    expect(birthRoute).toContain('mobileBirthServiceV1.create(request)');
    expect(birthRoute).toContain('calendarType,');
    expect(birthRoute).toContain('birthTime,');
    expect(birthRoute).toContain('sex,');
    expect(birthRoute).toContain('setTimeKnown(!unknown)');
    expect(birthRoute).toContain('onPress={() => void submit()}');
    expect(recordsRoute).toContain("previewText('기록')");
    expect(recordsRoute).toContain('previewLocale={previewLocale}');
    expect(recordsRoute).toContain('visibleItems(tab, snapshots)');
    expect(recordsRoute).toContain('itemCount={initialLoading ? null : items.length}');
    expect(recordsRoute).toContain('onOpenReading(item.source.readingId)');
    expect(recordsRoute).toContain('loadMore(tab)');
    expect(recordsHeader).toContain("previewText('지나온 이야기에도')");
    expect(recordsHeader).toContain("previewText('나의 결이 남습니다.')");
    expect(recordsHeader).toContain('previewText(tabLabels[selected])');
    expect(recordsHeader).toContain("t('기록을 확인하는 중')");
    const active = (source: string) => 'active:' + source;
    expect(previewMobileAuthoredUiLabelV1('출생정보', 'en-US', active)).toBe('Birth details');
    expect(previewMobileAuthoredUiLabelV1('기록을 불러오는 중입니다…', 'zh-CN', active)).toBe('正在加载记录…');
    expect(previewMobileAuthoredUiLabelV1('MY ARCHIVE · 명하', 'en-US', active)).toBe('MY ARCHIVE · MyeongHa');
    expect(previewMobileAuthoredUiLabelV1('나의 결이 남습니다.', null, active))
      .toBe('active:나의 결이 남습니다.');
  });

  it('passes Expo preview only to fixed calendar and time-picker copy while leaving values intact', async () => {
    const [route, calendar, time] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/birth/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/birth/BirthDateCalendar.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/birth/BirthTime12HourField.tsx', import.meta.url), 'utf8'),
    ]);
    expect(route).toContain('<BirthDateCalendar\n            previewLocale={previewLocale}');
    expect(route).toContain('<BirthTime12HourField\n            previewLocale={previewLocale}');
    for (const source of [calendar, time]) {
      expect(source).toContain('previewMobileAuthoredUiLabelV1(source, previewLocale, t)');
      expect(source).toContain('previewLocale = null');
      expect(source).not.toContain('X-MyeongHa-UI-Locale');
    }
    expect(calendar).toContain("accessibilityLabel={previewText('달력 닫기')}");
    expect(calendar).toContain("previewText('생년월일 선택')");
    expect(calendar).toContain('onSelect({');
    expect(calendar).toContain('daysInMonth(calendarType, year, month)');
    expect(calendar).toContain("calendarType === 'lunar' ? 30");
    expect(time).toContain("previewText('출생시간 분')");
    expect(time).toContain("previewText('태어난 시각 선택')");
    expect(time).toContain('value={minute}');
    expect(time).toContain('onMinuteChange(value.replace(/\\D/gu');
    expect(time).toContain('onHourChange(hour)');
    const active = (s: string) => 'active:' + s;
    expect(previewMobileAuthoredUiLabelV1('생년월일 선택', 'en-US', active)).toBe('Select date of birth');
    expect(previewMobileAuthoredUiLabelV1('시 선택 닫기', 'zh-CN', active)).toBe('关闭小时选择器');
    expect(previewMobileAuthoredUiLabelV1('달력 닫기', null, active)).toBe('active:달력 닫기');
  });

  it('previews only authored Records tabs, empty states, archive affordance and retry UI', async () => {
    const [route, components, header] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/records/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/records/RecordsComponents.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/records/RecordsEditorialHeader.tsx', import.meta.url), 'utf8'),
    ]);
    expect(route).toContain('renderItem(item, openReading, previewLocale)');
    expect(route).toContain('<RecordsTabs selected={tab} onSelect={setTab} previewLocale={previewLocale} />');
    expect(route).toContain('<RecordsEmptyState previewLocale={previewLocale} label={');
    expect(route).toContain('previewLocale={previewLocale}');
    expect(components).toContain('previewText(tab.label)');
    expect(components).toContain('previewText(emptyByCategory[label]');
    expect(components).toContain("previewText('저장된 풀이 다시 읽기 →')");
    expect(components).toContain("previewText('일부 기록을 불러오지 못했습니다')");
    expect(components).toContain("previewText('더 불러오기 다시 시도')");
    expect(components).toContain('item.factType');
    expect(components).toContain('item.memoryType');
    expect(components).toContain('item.sourceKind');
    expect(components).toContain('readingIsArchiveOpenableV1(item.productResponseState)');
    expect(components).toContain('t(readingReaderLabelV1(item.readerCharacterIds))');
    expect(components).toContain('revokedAt !== null');
    expect(header).toContain('previewText(tabLabels[selected])');
    expect(header).toContain('itemCount === null');
    expect(header).toContain('현재 불러온 기록');
    const active = (s: string) => 'active:' + s;
    expect(previewMobileAuthoredUiLabelV1('기억', 'en-US', active)).toBe('Memories');
    expect(previewMobileAuthoredUiLabelV1('지난 읽기', 'zh-CN', active)).toBe('历史解读');
    expect(previewMobileAuthoredUiLabelV1('저장된 풀이 다시 읽기 →', null, active))
      .toBe('active:저장된 풀이 다시 읽기 →');
  });

});
