import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  PLANNED_STATIC_UI_COPY_V1,
  lookupPlannedStaticUiCopyV1,
} from '../apps/web/ui-i18n-planned-copy-v1.js';
import {
  PLANNED_MOBILE_STATIC_UI_COPY_V1,
  lookupPlannedMobileStaticUiCopyV1,
} from '../apps/mobile/src/ui/mobile-planned-ui-copy-v1.js';
import {
  SUPPORTED_UI_LOCALES,
  PLANNED_UI_LOCALES,
  normalizeUiLocale,
} from '../apps/web/ui-i18n.js';
import {
  SUPPORTED_MOBILE_UI_LOCALES,
  PLANNED_MOBILE_UI_LOCALES,
  normalizeMobileUiLocale,
} from '../apps/mobile/src/ui/mobile-ui-copy.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-07 staged EN-US and ZH-CN authored UI copy', () => {
  it('authors both UI target variants for navigation, account, Saju input and chat read-state without missing parity', () => {
    expect(PLANNED_STATIC_UI_COPY_V1.size).toBe(482);
    expect([...PLANNED_MOBILE_STATIC_UI_COPY_V1]).toEqual([...PLANNED_STATIC_UI_COPY_V1]);
    for (const [ko, pair] of PLANNED_STATIC_UI_COPY_V1) {
      expect(ko.trim().length).toBeGreaterThan(0);
      expect(pair).toHaveLength(2);
      for (const text of pair) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/[가-힣]/u);
      }
      expect(lookupPlannedStaticUiCopyV1(ko, 'en-US')).toBe(pair[0]);
      expect(lookupPlannedStaticUiCopyV1(ko, 'zh-CN')).toBe(pair[1]);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'en-US')).toBe(pair[0]);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'zh-CN')).toBe(pair[1]);
    }
    expect(lookupPlannedStaticUiCopyV1('홈', 'en-US')).toBe('Home');
    expect(lookupPlannedStaticUiCopyV1('홈', 'zh-CN')).toBe('首页');
    expect(lookupPlannedStaticUiCopyV1('사주', 'zh-CN')).toBe('八字');
    expect(lookupPlannedMobileStaticUiCopyV1('대화 기록', 'en-US')).toBe('Chat history');
    expect(lookupPlannedMobileStaticUiCopyV1('대화 기록', 'zh-CN')).toBe('对话记录');
    expect(lookupPlannedStaticUiCopyV1('세계관 둘러보기', 'en-US')).toBe('Explore the world');
    expect(lookupPlannedStaticUiCopyV1('세계관 둘러보기', 'zh-CN')).toBe('探索世界观');
    expect(lookupPlannedMobileStaticUiCopyV1('현재 기록', 'zh-CN')).toBe('当前记录');
    expect(lookupPlannedMobileStaticUiCopyV1('달력 닫기', 'en-US')).toBe('Close calendar');
    expect(lookupPlannedMobileStaticUiCopyV1('전송', 'zh-CN')).toBe('发送');
  });

  it('reviews new EN/ZH-CN home, chat, account and photo shell labels', () => {
    const examples = [
      ['누구와 이야기를 시작해 볼까요?', 'Who would you like to talk to?', '想和谁开始聊天？'],
      ['오늘의 포춘쿠키', "Today's fortune cookie", '今日幸运饼干'],
      ['이야기 이어가기', 'Continue conversation', '继续对话'],
      ['자주 묻는 질문', 'Frequently asked questions', '常见问题'],
      ['사진 준비', 'Prepare photo', '准备照片'],
      ['명식 닫기', 'Close birth chart', '关闭命盘'],
    ] as const;
    for (const [source, english, chinese] of examples) {
      expect(lookupPlannedStaticUiCopyV1(source, 'en-US')).toBe(english);
      expect(lookupPlannedStaticUiCopyV1(source, 'zh-CN')).toBe(chinese);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'en-US')).toBe(english);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'zh-CN')).toBe(chinese);
    }
    expect(normalizeUiLocale('en-US')).toBe('en-US');
    expect(normalizeMobileUiLocale('zh-CN')).toBe('zh-CN');
    expect(lookupPlannedStaticUiCopyV1('message.body', 'en-US')).toBeNull();
  });

  it('protects active output while staging account, accessibility and source-status UI labels', () => {
    const examples = [
      ['메시지를 입력하세요…', 'Type a message…', '请输入消息…'],
      ['회원가입', 'Sign up', '注册'],
      ['출생 정보 수정 준비 중', 'Birth detail editing coming soon', '出生信息修改功能即将推出'],
      ['사진을 준비해 주세요', 'Please prepare a photo', '请准备照片'],
      ['이 화면은 계산 사실만 표시하며 해석을 생성하지 않습니다.',
       'This screen shows calculated facts only and does not generate interpretations.',
       '此页面仅显示计算事实，不生成解读。'],
      ['AI 답변 준비 중', 'AI replies coming soon', 'AI 回复功能准备中'],
    ] as const;
    for (const [source, en, zh] of examples) {
      expect(lookupPlannedStaticUiCopyV1(source, 'en-US')).toBe(en);
      expect(lookupPlannedStaticUiCopyV1(source, 'zh-CN')).toBe(zh);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'en-US')).toBe(en);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'zh-CN')).toBe(zh);
    }
    expect(normalizeUiLocale('en-US')).toBe('en-US');
    expect(normalizeMobileUiLocale('zh-CN')).toBe('zh-CN');
    expect(lookupPlannedStaticUiCopyV1('message.body', 'en-US')).toBeNull();
  });

  it('authors accurate EN/CN disclaimers for previews, account privacy and photo preparation', () => {
    const reviewed = [
      ['현재 월간 해석은 준비 중입니다. 검증된 전체 사주 프리뷰의 제공 상태를 상세 화면에서 확인할 수 있습니다.',
       'Monthly readings are not yet available. Check the detailed screen for availability of the verified general Saju preview.',
       '月度解读尚未开放。您可在详情页查看已验证的八字整体预览的提供状态。'],
      ['이 프리뷰는 공식 풀이 기록에 저장되지 않습니다. 다른 사주 읽기는 사주 페이지에서 선택할 수 있습니다.',
       'This preview is not saved as an official reading. Select other Saju readings on the Saju page.',
       '此预览不会保存为正式解读记录。您可在八字页面选择其他解读。'],
      ['현재 관상 화면은 브라우저에서 사진을 미리 확인하는 단계이며, 사진 분석 기능은 아직 연결되지 않았습니다.',
       'The face-reading screen currently previews photos in your browser. Photo analysis is not yet connected.',
       '目前面相页面仅支持在浏览器中预览照片，尚未接入照片分析功能。'],
      ['캐릭터가 삭제된 후 남는 기억 범위는 서로 다를 수 있습니다.',
       'The memories retained after a character is deleted may vary.',
       '删除角色后保留的记忆范围可能有所不同。'],
      ['현재 저장된 계정 정보를 조회하는 화면입니다. 프로필 변경 및 회원 탈퇴 요청은 검증된 서버 절차가 연결되기 전까지 이 화면에서 실행하지 않습니다.',
       'This screen shows saved account information. Profile edits and account deletion requests are unavailable here until verified server procedures are connected.',
       '此页面仅展示已保存的账户信息。在接入已验证的服务器流程前，无法在此修改资料或申请注销账户。'],
    ] as const;
    for (const [source, en, zh] of reviewed) {
      expect(lookupPlannedStaticUiCopyV1(source, 'en-US')).toBe(en);
      expect(lookupPlannedStaticUiCopyV1(source, 'zh-CN')).toBe(zh);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'en-US')).toBe(en);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'zh-CN')).toBe(zh);
    }
    expect(normalizeUiLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeMobileUiLocale('en-US')).toBe('en-US');
  });

  it('stages the exact member-account warnings and signed-in/guest narrative', () => {
    for (const [source, english, chinese] of [["나의 이야기를","My story","我的故事"],["이어가는 공간","continues here","在这里延续"],["MY MYEONGHA · 나의 공간","MY MYEONGHA · My space","MY MYEONGHA · 我的空间"],["계정, 출생정보와 명하에서 이어지는 길을 한곳에서 살펴보세요.","View your account, birth details and your journey in MyeongHa in one place.","在这里统一查看账户、出生信息和您在命河中的旅程。"],["이 기기에서는 회원 세션을 우선 사용합니다.","The member session takes precedence on this device.","在此设备上优先使用会员会话。"],["기존 계정으로 로그인하거나, 현재 게스트 기록을 그대로 이어받는 새 계정을 만들 수 있습니다.","Sign in with an existing account, or create a new one that retains your current guest records.","登录现有账户，或创建新账户以保留当前访客记录。"],["새 계정은 현재 게스트 주체를 그대로 회원으로 승격합니다. 기존 회원 계정과의 게스트 기록 병합은 아직 지원하지 않습니다.","A new account upgrades your current guest identity to a member. Merging guest records into an existing member account is not supported yet.","创建新账户会将当前访客身份升级为会员。暂不支持将访客记录合并到已有会员账户。"],["확인 링크는 현재 Web 확인 화면으로 열립니다. 이메일 확인을 마친 뒤 앱으로 돌아와 비밀번호를 다시 입력해 주세요.","The verification link currently opens a web confirmation page. After verifying your email, return to the app and enter your password again.","验证链接目前会打开网页版确认页面。完成邮箱验证后，请返回应用并再次输入密码。"]] as const) {
      expect(lookupPlannedStaticUiCopyV1(source, 'en-US')).toBe(english);
      expect(lookupPlannedStaticUiCopyV1(source, 'zh-CN')).toBe(chinese);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'en-US')).toBe(english);
      expect(lookupPlannedMobileStaticUiCopyV1(source, 'zh-CN')).toBe(chinese);
    }
    expect(normalizeUiLocale('en-US')).toBe('en-US');
    expect(normalizeMobileUiLocale('zh-CN')).toBe('zh-CN');
  });

  it('stages birth-input and archive headings without interpreting record contents', () => {
    const entries = [["명식을 계산하기 위한 현재 자기 출생정보를 등록합니다.","Register your current birth details to calculate your birth chart.","登记您当前的出生信息以计算命盘。"],["MY ARCHIVE · 명하","MY ARCHIVE · MyeongHa","MY ARCHIVE · 命河"],["지나온 이야기에도","Even in stories past,","即使在过往的故事里，"],["나의 결이 남습니다.","my unique imprint remains.","也留有属于我的印记。"],["기억","Memories","记忆"]] as const;
    for (const [ko, en, zh] of entries) {
      expect(lookupPlannedStaticUiCopyV1(ko, 'en-US')).toBe(en);
      expect(lookupPlannedStaticUiCopyV1(ko, 'zh-CN')).toBe(zh);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'en-US')).toBe(en);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'zh-CN')).toBe(zh);
    }
    expect(lookupPlannedMobileStaticUiCopyV1('record.private.body', 'en-US')).toBeNull();
  });

  it('stages source-authored EN/CN Saju, Face and Chat shell/warning text', () => {
    const rows = [["태어난 순간의 이야기를 바탕으로 나의 명식을 알아보세요.","Explore your birth chart using the details of when you were born.","根据出生时的信息，了解您的命盘。"],["얼굴에 담긴 이야기를 만나기 위한 첫 단계, 사진부터 준비해 보세요.","Start by preparing a photo for your face-reading journey.","从准备照片开始，迈出面相解读的第一步。"],["저마다 다른 목소리로, 당신의 이야기를 들어줄 연결자들을 만나보세요.","Meet guides with different voices who are ready to hear your story.","认识风格各异、愿意倾听您故事的引路人。"],["대화 열기는 회원 로그인 후 가능합니다. 일부 AI 답변과 기존 기록은 현재 이용이 제한될 수 있습니다.","Sign in as a member to open a chat. Some AI replies and past records may currently be unavailable.","登录会员账户后才能开启对话。部分 AI 回复及历史记录目前可能无法使用。"],["선택한 연결자로 사주 읽기 시작 →","Start a Saju reading with your selected guide →","与所选引路人开始八字解读 →"]] as const;
    for (const [ko, en, zh] of rows) {
      expect(lookupPlannedStaticUiCopyV1(ko, 'en-US')).toBe(en);
      expect(lookupPlannedStaticUiCopyV1(ko, 'zh-CN')).toBe(zh);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'en-US')).toBe(en);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'zh-CN')).toBe(zh);
    }
    expect(normalizeMobileUiLocale('en-US')).toBe('en-US');
    expect(normalizeMobileUiLocale('zh-CN')).toBe('zh-CN');
  });

  it('fails closed for unsupported input and for source, private messages or unknown copy', () => {
    for (const text of [
      '1995-08-17 19:30', 'SEYEON_HISTORY_REVEAL_HOLD',
      'USER_CHAT_SECRET_NEVER_TRANSLATE_2026', '직접 입력한 사적인 메모',
      '서버가 보낸 미확인 공식 풀이', 'message.body', 'greeting.openingLine',
    ]) {
      for (const locale of ['en-US', 'zh-CN']) {
        expect(lookupPlannedStaticUiCopyV1(text, locale)).toBeNull();
        expect(lookupPlannedMobileStaticUiCopyV1(text, locale)).toBeNull();
      }
    }
    for (const protectedKey of ['세연','백헌','명하','갑','계','목','금','7명의 신의 연결자가']) {
      expect(lookupPlannedStaticUiCopyV1(protectedKey, 'en-US')).toBeNull();
      expect(lookupPlannedMobileStaticUiCopyV1(protectedKey, 'zh-CN')).toBeNull();
    }
    for (const unsupported of ['ko-KR', 'ja-JP', 'zh-TW', 'en', 'en-GB', 'zh', 'zh-Hans', null, undefined]) {
      expect(lookupPlannedStaticUiCopyV1('홈', unsupported)).toBeNull();
      expect(lookupPlannedMobileStaticUiCopyV1('홈', unsupported)).toBeNull();
    }
  });

  it('does not silently enable English or Simplified Chinese from the staged copy alone', async () => {
    const [web, mobile, api, plannedWeb, plannedMobile] = await Promise.all([
      source('apps/web/ui-i18n.js'),
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
      source('apps/api/src/request-ui-locale-v1.ts'),
      source('apps/web/ui-i18n-planned-copy-v1.js'),
      source('apps/mobile/src/ui/mobile-planned-ui-copy-v1.ts'),
    ]);
    expect(PLANNED_UI_LOCALES).toEqual(['en-US', 'zh-CN']);
    expect(PLANNED_MOBILE_UI_LOCALES).toEqual(PLANNED_UI_LOCALES);
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR', 'ja-JP', 'zh-TW']);
    expect(SUPPORTED_MOBILE_UI_LOCALES).toEqual(SUPPORTED_UI_LOCALES);
    for (const locale of PLANNED_UI_LOCALES) {
      expect(normalizeUiLocale(locale)).toBe('ko-KR');
      expect(normalizeMobileUiLocale(locale)).toBe('ko-KR');
    }
    expect(web).not.toContain('lookupPlannedStaticUiCopyV1(');
    expect(mobile).not.toContain('lookupPlannedMobileStaticUiCopyV1(');
    expect(api).not.toContain("'en-US' ||");
    expect(api).not.toContain("'zh-CN' ||");
    expect(plannedWeb).not.toContain('fetch(');
    expect(plannedMobile).not.toContain('fetch(');
    expect(plannedWeb).not.toContain('responseVoiceLocale');
    expect(plannedMobile).not.toContain('responseVoiceLocale');
  });
});
