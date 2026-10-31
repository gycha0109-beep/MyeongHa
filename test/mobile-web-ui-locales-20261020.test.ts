import { readFile } from 'node:fs/promises';
import { FORTUNE_COOKIE_MESSAGES_V1, displayFortuneCookieNoteV1 } from '../apps/mobile/src/features/home/mobile-fortune-cookie.js';
import { describe, expect, it } from 'vitest';

import {
  normalizeUiLocale,
  translateStaticUi,
  SUPPORTED_UI_LOCALES,
} from '../apps/web/ui-i18n.js';
import {
  normalizeMobileUiLocale,
  translateMobileUiCopy,
  formatMobileUiCopy,
  localizeMobileLiteralText,
  SUPPORTED_MOBILE_UI_LOCALES,
} from '../apps/mobile/src/ui/mobile-ui-copy.js';

async function source(path: string) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

describe('Mobile / Web UI localization parity', () => {
  it('uses the same Korean / Japanese / Traditional Chinese language roster and fallback', () => {
    expect(SUPPORTED_MOBILE_UI_LOCALES).toEqual(SUPPORTED_UI_LOCALES);
    for (const value of ['ko-KR', 'ja-JP', 'zh-TW', 'zh-CN', 'en-US', null, undefined, '']) {
      expect(normalizeMobileUiLocale(value)).toBe(normalizeUiLocale(value));
    }
  });

  it('transplants every current web-authored translation without changing wording', async () => {
    const webSource = await source('apps/web/ui-i18n.js');
    const start = webSource.indexOf('const COPY = new Map(') + 'const COPY = new Map('.length;
    const end = webSource.indexOf('].map(([source', start) + 1;
    const entries = JSON.parse(webSource.slice(start, end)) as Array<[string, string, string]>;
    expect(entries.length).toBeGreaterThan(0);
    for (const [korean, japanese, chinese] of entries) {
      expect(translateMobileUiCopy(korean, 'ko-KR')).toBe(korean);
      expect(translateMobileUiCopy(korean, 'ja-JP')).toBe(japanese);
      expect(translateMobileUiCopy(korean, 'zh-TW')).toBe(chinese);
      expect(translateMobileUiCopy(korean, 'ja-JP')).toBe(translateStaticUi(korean, 'ja-JP'));
      expect(translateMobileUiCopy(korean, 'zh-TW')).toBe(translateStaticUi(korean, 'zh-TW'));
    }
  });

  it('keeps added Seyeon withdrawal notices consistent between web and mobile', () => {
    const notices = [
      '기억 접근 권한이 변경되어 이전 세연 답변을 표시하지 않습니다. 이후 접근 여부는 서버에서 다시 확인합니다.',
      '기억 접근 철회 요청이 확인되어 이전 세연 답변을 숨겼습니다. 이후 접근 권한은 서버에서 다시 확인합니다.',
    ];
    for (const notice of notices) {
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        const translated = translateStaticUi(notice, locale);
        expect(translated, `web ${locale}`).not.toMatch(/[가-힣]/u);
        expect(translateMobileUiCopy(notice, locale)).toBe(translated);
      }
    }
  });

  it('keeps unknown or private text, submitted facts, and model output unchanged', () => {
    for (const value of [
      '사용자의 고유한 대화 내용',
      '1995-08-17 19:30',
      'PERSONAL_JOURNAL_SECRET_2026',
      '오늘 우울해서 친구에게만 말하고 싶었어요.',
    ]) {
      for (const locale of SUPPORTED_MOBILE_UI_LOCALES) {
        expect(translateMobileUiCopy(value, locale)).toBe(value);
      }
    }
  });

  it('supports web placeholders, mobile-only fixed copy and indented React Native literal leaves', () => {
    expect(translateMobileUiCopy('홈', 'ja-JP')).toBe('ホーム');
    expect(translateMobileUiCopy('사주', 'zh-TW')).toBe('八字命理');
    expect(translateMobileUiCopy('출생정보', 'ja-JP')).toBe('出生情報');
    expect(translateMobileUiCopy('화면 테마', 'zh-TW')).toBe('畫面主題');
    expect(formatMobileUiCopy('{reader}과 관상 보기', { reader: '세연' }, 'ja-JP'))
      .toBe('세연と人相鑑定'); // character label supplied by caller unchanged
    expect(localizeMobileLiteralText('\n          생년월일\n        ', 'ja-JP'))
      .toBe('\n          生年月日\n        ');
    expect(localizeMobileLiteralText('\n          출생정보\n        ', 'zh-TW'))
      .toBe('\n          出生資料\n        ');
  });

  it('has an app-wide persisted locale, settings choices and tab localization', async () => {
    const [root, provider, my, tabs, text] = await Promise.all([
      source('apps/mobile/src/app/_layout.tsx'),
      source('apps/mobile/src/ui/mobile-ui-locale.tsx'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
      source('apps/mobile/src/app/(tabs)/_layout.tsx'),
      source('apps/mobile/src/ui/MobileUiText.tsx'),
    ]);
    expect(root).toContain('<MobileUiLocaleProvider>');
    expect(provider).toContain("SecureStore.getItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY)");
    expect(provider).toContain('SecureStore.setItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY, normalized)');
    expect(my).toContain("value: 'ko-KR', label: '한국어'");
    expect(my).toContain("value: 'ja-JP', label: '日本語'");
    expect(my).toContain("value: 'zh-TW', label: '繁體中文'");
    expect(my).toContain('<MyLocaleSelector />');
    expect(tabs).toContain("title: t('사주')");
    expect(tabs).toContain("title: t('마이')");
    expect(text).toContain("typeof children === 'string'");
  });

  it('only opts in fixed JSX leaf text and does not change chat, readings, or API payloads', async () => {
    const [chat, saju, records, birth, sourceCopy] = await Promise.all([
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/features/records/RecordsComponents.tsx'),
      source('apps/mobile/src/app/birth/index.tsx'),
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
    ]);
    expect(chat).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(chat).toContain('<MobileUiText');
    expect(saju).toContain('<MobileUiText');
    expect(records).toContain('<MobileUiText');
    expect(birth).toContain('<MobileUiText');
    expect(sourceCopy).toContain('export function translateMobileUiCopy');
    expect(sourceCopy).not.toContain('fetch(');
  });

  it('translates audited native-only screen guidance and accessible controls without touching private data', async () => {
    for (const sourceText of [
      '얼굴에 담긴 이야기를 만나기 위한 첫 단계, 사진부터 준비해 보세요.',
      '저마다 다른 목소리로, 당신의 이야기를 들어줄 연결자들을 만나보세요.',
      '나의 계정과 이야기, 설정을 살펴보세요.',
      '태어난 순간의 이야기를 바탕으로 나의 명식을 알아보세요.',
      '달력 닫기',
      '10년 전',
      '이전 달',
      '전면 카메라로 정면 사진 촬영',
      '선택한 Reader와 전체 사주 읽기 시작',
      '근거·상세 보기 ▼',
    ]) {
      expect(translateMobileUiCopy(sourceText, 'ja-JP')).not.toBe(sourceText);
      expect(translateMobileUiCopy(sourceText, 'zh-TW')).not.toBe(sourceText);
    }
    expect(formatMobileUiCopy('{reader}에게 보여줄 사진', { reader: '세연' }, 'ja-JP'))
      .toBe('セヨンに見せる写真'.replace('セヨン', '세연'));
    const [calendar, face, scene, composer] = await Promise.all([
      source('apps/mobile/src/features/birth/BirthDateCalendar.tsx'),
      source('apps/mobile/src/app/(tabs)/reading/face.tsx'),
      source('apps/mobile/src/app/reading/scene.tsx'),
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
    ]);
    expect(calendar).toContain("accessibilityLabel={t('달력 닫기')}");
    expect(face).toContain("accessibilityLabel={t('전면 카메라로 정면 사진 촬영')}");
    expect(scene).toContain("t('근거')");
    expect(scene).toContain('{currentStep.primary}');
    expect(composer).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(composer).toContain("t('개인정보 보호를 위한 서버 확인이 끝나지 않아");
    expect(composer).toContain("t('대화 기록과 메시지 보내기는 개인정보 공개 권한 검증이");
  });

  it('keeps Android status/navigation windows outside the scrollable app and tabs', async () => {
    const [root, home, records, screen] = await Promise.all([
      source('apps/mobile/src/app/_layout.tsx'),
      source('apps/mobile/src/app/(tabs)/index.tsx'),
      source('apps/mobile/src/app/(tabs)/records/index.tsx'),
      source('apps/mobile/src/ui/MobileScreen.tsx'),
    ]);
    expect(root).toContain("SafeAreaProvider");
    expect(root).toContain("edges={['top', 'bottom']}");
    expect(root).toContain('<SafeAreaView');
    for (const nested of [home, records, screen]) {
      expect(nested).not.toContain('SafeAreaView');
    }
  });

  it('does not leak photographed Korean-only fixed copy or fortune notes when Japanese/Chinese is selected', async () => {
    const visibleCopy = [
      '행운의 쪽지 열기', 'MY MYEONGHA · 나의 공간',
      '계정, 출생정보와 명하에서 이어지는 길을 한곳에서 살펴보세요.',
      '지나온 이야기에도', '나의 결이 남습니다.',
      '아직 기록이 없습니다', '아직 현세록이 없습니다',
      '아직 지난 읽기가 없습니다', '아직 기억이 없습니다',
      '네 기둥 계산 완료', '좋은 아침이에요',
      '이용 상태는 대화방에서 확인',
    ];
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      for (const copy of visibleCopy) {
        const translated = translateMobileUiCopy(copy, locale);
        expect(translated, copy).not.toBe(copy);
        expect(translated, copy).not.toMatch(/[가-힣]/u);
      }
      for (let index = 0; index < FORTUNE_COOKIE_MESSAGES_V1.length; index += 1) {
        const note = displayFortuneCookieNoteV1(index, locale);
        expect(note).not.toBe('');
        expect(note).not.toMatch(/[가-힣]/u);
      }
    }
    expect(displayFortuneCookieNoteV1(0, 'ko-KR')).toBe(FORTUNE_COOKIE_MESSAGES_V1[0]);
    expect(displayFortuneCookieNoteV1(-1, 'ja-JP')).toBe('');
    expect(displayFortuneCookieNoteV1(FORTUNE_COOKIE_MESSAGES_V1.length, 'zh-TW')).toBe('');
  });

  it('translates static catalog/empty states while retaining personal names and official reading output', async () => {
    const [home, records, chat, saju, profile] = await Promise.all([
      source('apps/mobile/src/features/home/HomeComponents.tsx'),
      source('apps/mobile/src/features/records/RecordsComponents.tsx'),
      source('apps/mobile/src/app/(tabs)/chat/index.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
    ]);
    expect(home).toContain('t(topic.title)');
    expect(home).toContain('t(topic.subtitle)');
    expect(records).toContain('t(emptyByCategory[label]');
    expect(chat).toContain('t(presentation.openingLine)');
    expect(saju).toContain('t(topic.availability.statusLabel)');
    expect(saju).toContain('{step.primary}');
    expect(profile).toContain("profile.displayName === '호칭 미설정'");
  });

  it('localizes UI-only Saju and Reader error/HOLD states in new locales without translating source payloads', async () => {
    const labels = [
      '현재 이 주제를 표시할 만큼 검증된 해석 근거가 충분하지 않습니다.',
      '사주 프리뷰를 불러오지 못했습니다.',
      '검증되지 않은 사주 해석 응답은 표시하지 않습니다.',
      '현재 승인된 프리뷰 범위 밖의 읽기입니다.',
      '계정 또는 세션이 변경되어 이전 사주 읽기를 종료했습니다.',
      '좋은 오후예요', '좋은 저녁이에요',
      '연결자 초상화', '{count}/4 기둥 확정',
      '내 사주를 확인하면 읽기의 시작점을 찾을 수 있습니다.',
      '일주가 확정되면 일간을 표시합니다.',
      '장면 연출 · 실제 해석 내용은 서버의 검증된 사주 프리뷰만 사용합니다.',
      '현재 확인할 수 있는 기록의 끝입니다.',
    ];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const label of labels) {
        const result = translateMobileUiCopy(label, locale);
        expect(result, `${locale} missing: ${label}`).not.toBe(label);
        expect(result).not.toMatch(/[가-힣]/u);
      }
    }
    const acceptanceCopy = ["Reader 선택","프리뷰만","프리뷰 소개","컨셉 준비 중","닫기","변경","현재 세연만 프리뷰 장면을 선택할 수 있으며, 유료 Reader 해석은 아직 공개되지 않았습니다.","Reader 표시와 프리뷰 선택은 상품 지원, 구매 접근권, 공개 승인 또는 공식 Reading 열람 권한을 뜻하지 않습니다. 이 권한들은 서버가 각각 확인해야 합니다.","선택한 Reader는 현재 사주 프리뷰 화면의 표시만 바꿉니다. 해석 근거와 내용은 변경되지 않습니다.","선택한 Reader는 현재 관상 준비 화면의 표시만 바꿉니다. 사진 분석과 Reader 풀이는 아직 열리지 않았습니다.","READER · 세연 프리뷰 장면","READER · 준비 중","이 공식 사주를 읽어줄 인물","공식 Reading 기반의 Reader 소개입니다. 해설 실행 및 후속 대화는 제공되지 않습니다.","인물 소개만 변경하며 유료 해설은 실행하지 않습니다.","소개 보기","현재 선택은 인물 소개를 보기 위한 것입니다. 이 Reader의 구매 접근권, 공식 Reading 열람 또는 전용 Thread가 생성되지 않습니다.","해설 진입 상태","Reader 해설 진입 비활성","해설 서비스 준비 중","Reader 소개 및 기록 연결은 상품 적격성, 구매 접근권, 공개 승인, 공식 Reading 접근 허가의 증명이 아닙니다.","공식 Reader 해설은 아직 공개되지 않았습니다.","상품·구매·공개 승인·공식 Reading 접근을 서버에서 확인해야 합니다.","이 상품은 해당 Reader 해설 대상이 아닙니다.","해설 구매 접근권이 확인되지 않았습니다.","해당 Reader 해설의 공개 승인을 기다리고 있습니다.","해당 Reader 해설은 현재 이용할 수 없습니다.","이 공식 Reading에 대한 해설 접근이 허용되지 않았습니다.","서버 확인 중 일시적인 문제가 발생했습니다. 해설 진입은 차단됩니다.","권한 또는 응답을 안전하게 확인할 수 없어 해설 진입을 차단했습니다.","개별 확인 후에도 실제 해설 진입에는 별도 서버 승인이 필요합니다.","대화 상대","서버가 확인한 대화방","프로필","오류 코드","세연에게 하고 싶은 말을 적어주세요","대화 상대를 확인하고 있습니다","대화 기록을 확인한 뒤 메시지를 보낼 수 있습니다","이 캐릭터의 AI 대화는 준비 중입니다","대화방 기록을 불러오지 못한 경우 다시 입장해 주세요.","캐릭터 대화방과 기록은 이용할 수 있으며, AI 답변 기능은 추후 열립니다.","등록된 대상","현재 계정에 등록된 대상의 출생정보를 확인합니다.","이름 없는 대상","성별 미지정","성별 정보 없음","음력 · 윤달","출생정보 revision","신규 추가만 지원합니다. 수정·삭제·궁합 실행은 아직 지원하지 않습니다.","현재 등록된 대상이 없습니다.","새 대상 추가","궁합 등에 사용할 상대의 기본 정보와 출생정보를 등록합니다.","이름 또는 별칭","관계 (예: 친구)","선택 안 함","대상 추가","생성 후 라벨 수정·삭제·출생정보 수정·궁합 실행은 아직 열지 않습니다.","세연 대화 기록을 현재 표시할 수 없습니다","개인정보 보호를 위한 서버 확인이 끝나지 않아 대화 기록을 표시할 수 없습니다. 반복해서 불러와도 해제되지 않습니다.","대화 기록을 확인하지 못했습니다. 아래에서 다시 불러올 수 있습니다.","세연 대화는 서버의 보호 조치로 잠시 중단되었습니다","대화 기록과 메시지 보내기는 개인정보 공개 권한 검증이 끝난 뒤 이용할 수 있습니다. 앱을 다시 설치해도 이 제한은 해제되지 않습니다."];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const label of acceptanceCopy) {
        const translated = translateMobileUiCopy(label, locale);
        expect(translated, `${locale} missing: ${label}`).not.toBe(label);
        // Preserve the Character's canonical Korean name even in localized UI.
        expect(translated.replaceAll('세연', '')).not.toMatch(/[가-힣]/u);
      }
    }
    const [picker, readerEntry, composer, people] = await Promise.all([
      source('apps/mobile/src/features/reading/MobileReaderPicker.tsx'),
      source('apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx'),
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/features/my/MyTargetPersons.tsx'),
    ]);
    expect(picker).toContain("t(accessView.previewPresentation");
    expect(readerEntry).toContain('t(entry.statusMessage)');
    expect(composer).toContain('{message.body}');
    expect(composer).toContain("placeholder={t('세연에게 하고 싶은 말을 적어주세요')}");
    expect(people).toContain('item.relationshipLabel');
    expect(people).toContain('item.displayLabel?.trim()');
    const extraCopy = ["이 기기 알림 연결됨","현재 주체에 Expo Push 수신 기기가 등록되어 있습니다.","알림 연결 확인 필요","기기 권한은 유지 중이며 서버 등록을 다시 확인해야 합니다.","기기 알림 권한 꺼짐","OS 설정에서 알림 권한을 허용한 뒤 다시 연결해 주세요.","현재 빌드에서는 준비 중","EAS projectId가 연결된 네이티브 빌드에서 Push 등록을 활성화합니다.","알림 받기","사용자가 허용하면 이 기기를 현재 주체의 Push 수신 기기로 등록합니다.","알림 연결을 확인하는 중입니다…","이 기기 알림 끄기","다시 연결","알림 허용 및 기기 등록","지금은 기기 등록·갱신·해제 기반만 활성화합니다. 자동 발송 시점과 빈도는 아직 적용하지 않습니다.","얼굴에 담긴 나의 이야기","정면 사진을 준비하고, {reader}과 함께할 관상 읽기의 시작을 만나보세요.","이야기가 머무는 곳","오늘은 어떤 이야기를 나눠볼까요?","여섯 연결자의 이야기를 만나보세요.","캐릭터 만나기","명식과 풀이 살펴보기","지난 이야기","대화 가능 여부와 기록 접근은 로그인 및 현재 서비스 상태에 따라 달라집니다.","음력 29일·30일 및 윤달의 실제 존재 여부는 저장 시 서버에서 확인합니다.","외부 로그인 화면에서 확인을 마치면 자동으로 돌아옵니다.","연결되지 않은 결제·상세 계정관리·지원 상태는 임의로 표시하지 않습니다."];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const label of extraCopy) {
        const translated = translateMobileUiCopy(label, locale);
        expect(translated, `${locale} missing: ${label}`).not.toBe(label);
        expect(translated.replace('{reader}', '')).not.toMatch(/[가-힣]/u);
      }
    }
    const [push, faceEditorial] = await Promise.all([
      source('apps/mobile/src/features/my/MyPushNotifications.tsx'),
      source('apps/mobile/src/features/face/FaceEditorialIntro.tsx'),
    ]);
    expect(push).toContain('t(copy.title)');
    expect(push).toContain('t(copy.body)');
    expect(push).toContain('{errorMessage}');
    expect(faceEditorial).toContain('reader: reader.name');
    expect(formatMobileUiCopy('정면 사진을 준비하고, {reader}과 함께할 관상 읽기의 시작을 만나보세요.', { reader: '세연' }, 'en-US')).toContain('세연');
    const finalMobileCopy = ["촬영한 사진","선택한 사진","사진 준비 완료","사진을 준비하면 다음 단계가 표시됩니다","관상 분석 기능 준비 중","{reader}과 관상 보기 준비","카메라 권한이 필요합니다. 기기 설정에서 카메라 접근을 허용해 주세요.","사진을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.","한 장의 사진만 선택할 수 있습니다.","16MB 이하의 사진을 선택해 주세요.","JPEG, PNG 또는 WebP 사진을 선택해 주세요.","선택한 사진을 사용할 수 없습니다. 다른 사진을 선택해 주세요.","카메라 권한을 확인하지 못했습니다.","사진을 촬영하지 못했습니다. 다시 시도해 주세요.","전면 카메라를 열지 못했습니다.","촬영 중…","사진 촬영","달력에서 날짜 선택","이미 등록된 출생정보가 있습니다. 현재 내용은 사주 탭에서 확인해 주세요.","현재 출생정보를 다시 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다.","출생정보를 확인해 주세요.","입력값을 처리하지 못했습니다. 생년월일과 출생시간을 확인해 주세요.","서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.","출생정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.","출생 연도는 네 자리로 입력해 주세요.","출생 연도를 확인해 주세요.","존재하는 양력 생년월일을 입력해 주세요.","출생시간은 HH:mm 형식으로 입력해 주세요.","출생시간을 확인해 주세요.","달력 유형을 확인해 주세요.","출생 월을 입력해 주세요.","출생 월을 확인해 주세요.","출생 일을 입력해 주세요.","출생 일을 확인해 주세요.","저장된 공식 풀이를 불러오는 중입니다…","로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.","현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.","저장된 공식 풀이를 안전하게 표시할 수 없습니다.","저장된 풀이를 불러오지 못했습니다.","이 공식 Reading과 Reader","공식 기록에 연결된 Reader 정보: {count}명","이 공식 기록에 연결된 Reader 정보가 없습니다.","Reader 연결 정보는 해설 구매·열람 권한 또는 해설 완료의 증명이 아닙니다. Reader별 해설 다시 보기와 후속 대화는 별도의 서버 권한·기록 계약이 승인된 뒤 제공됩니다.","기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다."];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const label of finalMobileCopy) {
        const localized = translateMobileUiCopy(label, locale);
        expect(localized, `${locale} missing: ${label}`).not.toBe(label);
        expect(localized).not.toMatch(/[가-힣]/u);
      }
    }
    const [face, camera, birth, archived] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/reading/face.tsx'),
      source('apps/mobile/src/platform/media/MobileFrontCameraV1.tsx'),
      source('apps/mobile/src/app/birth/index.tsx'),
      source('apps/mobile/src/app/reading/[readingId].tsx'),
    ]);
    expect(face).toContain('formatMobileUiCopy(');
    expect(face).toContain('{t(state.message)}');
    expect(camera).toContain('t(error)');
    expect(birth).toContain("{t(option.label)}");
    expect(birth).toContain("locale === 'en-US'");
    expect(archived).toContain('formatMobileUiCopy(');
    expect(archived).toContain('{step.primary}');
    expect(archived).toContain('{notice}');
    expect(archived).toContain('{text}');
    const missingLeafCopy = ["로그인 후 대화하기 →","‹ 대화로 돌아가기","대화 링크를 확인할 수 없습니다","올바른 기존 대화 링크로 다시 들어와 주세요.","대화로 돌아가기","출생정보를 확인하는 중입니다…","선택한 Reader와 전체 사주 읽기 시작","PHOTO · 정면 사진","{reader}에게 보여줄 사진","얼굴 전체가 보이도록 정면을 바라봐 주세요. 밝은 조명과 선명한 사진이 좋습니다.","▣ 사진 촬영","▧ 사진 선택","현재는 사진 촬영·선택과 미리보기만 가능합니다. 서버 분석은 시작하지 않습니다. 얼굴 분석과 관상 풀이는 아직 제공하지 않습니다.","선택한 사진은 이 화면에서만 일시적으로 사용하며 기기 보안 저장소나 앱 기록에 저장하지 않습니다.","삶의 사실과 지난 풀이, 저장된 기억을 차분히 찾아보세요.","← 기록으로 돌아가기","아직 내 명식이 없습니다. 출생정보를 등록하면 현재 명식을 확인할 수 있습니다.","현재 출생정보를 기준으로 계산된 명식 사실만 보여줍니다.","명하","회원 전용 · 세연과의 대화는 서버에 보관됩니다.","세연에게 보낼 메시지","관계","지금 확인할 수 있는 삶의 기록과 사주 풀이를 차분히 살펴보세요.","모호","미확정","궁금한 주제를 선택해 더 깊이 살펴보세요. 준비된 풀이만 연결되며, 아직 확인이 필요한 주제는 현재 상태를 안내합니다.","다른 주제의 풀이로 자동 대체하지 않습니다.","웹과 동일하게 권한이 열리기 전에는 다른 풀이를 대신 실행하지 않습니다.","Preview · 연구 검증 중인 원국 해석이며 확정적 미래 예측은 포함하지 않습니다.","나의 명식, 나를 읽는 첫 장","태어난 순간의 정보를 토대로 계산한 명식을 확인해 보세요.","이 정보는 검증된 명식 계산 결과입니다. 하루 운세나 미래를 예측한 내용이 아닙니다.","얼굴 전체가 타원 안에 들어오도록 맞춰주세요","정면 사진을 촬영하려면 카메라 권한이 필요합니다."];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const label of missingLeafCopy) {
        const rendered = translateMobileUiCopy(label, locale);
        expect(rendered, `${locale} missing: ${label}`).not.toBe(label);
        expect(rendered.replaceAll('세연', '')).not.toMatch(/[가-힣]/u);
      }
    }
    expect(formatMobileUiCopy('{reader}에게 보여줄 사진', { reader: '세연' }, 'en-US')).toBe('Photo for 세연');
    const original = '사용자의 고유한 대화 내용';
    expect(translateMobileUiCopy(original, 'en-US')).toBe(original);
    expect(translateMobileUiCopy(original, 'zh-CN')).toBe(original);
  });

});
