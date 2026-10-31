import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatStaticUi, translateStaticUi } from '../apps/web/ui-i18n.js';

const root = resolve(process.cwd(), 'apps/web');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const screens = [
  'src/chat-hub/ChatHubPage.tsx',
  'src/chat/ChatPage.tsx',
  'src/my/MyPage.tsx',
  'src/records/RecordsPage.tsx',
  'face-reading.html',
  'src/birth/BirthPage.tsx',
  'src/reading/ReadingPage.tsx',
  'src/landing/LandingPage.tsx',
  'src/auth/AuthPage.tsx',
  'src/commerce/CreditRechargeDialog.tsx',
] as const;
const fixedUi = [
  '명하의 안내인',
  '왔네요. 오늘은 어떤 이야기부터 해볼까요?',
  '베테랑 조정자',
  '이야기하기',
  '어떤 연결자와 함께 볼까요?',
  '이름이나 설명으로 연결자 찾기',
  '연결자는 확인된 관상 결과의 전달 방식과 대화 경험을 맡습니다. 연결자 선택이 관상 의미 자체를 새로 만들거나 바꾸지는 않습니다.',
  '선택한 연결자',
  '연결자 변경',
  '01 · 사진 준비',
  '얼굴 전체가 프레임 안에 들어온 사진',
  '사진 촬영',
  '사진 선택',
  '사진을 건넵니다',
  '얼굴을 살펴봅니다',
  '연결자가 풀어드립니다',
  '대화를 시작하려면 로그인이 필요합니다.',
  '크레딧·충전 안내',
  '현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.',
  '내가 남긴 삶의 사실, 사주에서 읽어낸 결과, 태어난 순간의 기록, 대리가 기억하고 있는 내용을 서로 섞지 않고 확인합니다.',
  '길어진 하루 끝에',
  '다시 나를 보는 곳.',
  '내 정보를 보려면 현재 세션이 필요합니다. 사주·기록·대화 화면은 계속 둘러볼 수 있습니다.',
  '오늘의 나',
  '내 흐름',
  '내 사주',
  '내 기록',
  '이어지는 대화',
  '내 사주에서 현재 해석을 확인합니다.',
  '대화 허브에서 이어갈 상대를 선택합니다.',
  '지나온 기록에서 저장된 내용을 확인합니다.',
  '태어난 순간부터',
  '적혀 있던 기록을,',
  '선택한 달력 기준의 날짜를 입력합니다.',
  '이미 저장된 출생 정보가 있습니다.',
  '무료 프리뷰이며, 구매권 또는 저장된 유료 해석을 의미하지 않습니다.',
  '사진을 불러오고 있습니다.',
  '사진을 먼저 준비해주세요',
  '이어 보던 흐름을',
  '내 계정으로 가져갑니다.',
  '계정 인증',
  '크레딧이 부족해요',
  '현재 사용 가능한 크레딧',
  '크레딧 충전하기',
] as const;

describe('Web EN/CN screenshot UI acceptance', () => {
  it('authors static interface copy for every screenshot surface without leaving Korean', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const source of fixedUi) {
        const localized = translateStaticUi(source, locale);
        expect(localized, `${locale}: ${source}`).not.toBe(source);
        expect(localized).not.toMatch(/[가-힣]/u);
      }
      expect(formatStaticUi('{reader}과 함께 관상을 봅니다.', { reader: '세연' }, locale))
        .toContain('세연');
      expect(formatStaticUi('{reader}과 관상 보기', { reader: '세연' }, locale))
        .toContain('세연');
    }
  });
  it('wires client-rendered cards, modal, photos and account state into localized UI', () => {
    expect(read('chat-hub.js')).toContain('uiLabel(person.title)');
    expect(read('chat-hub.js')).toContain('uiLabel(person.line)');
    expect(read('reader-picker-dialog.js')).toContain('paintFixedUi();');
    expect(read('reader-picker-dialog.js')).toContain('translateStaticUi(targetSource, locale)');
    expect(read('face-reading-shell.js')).toContain("renderReaderHeading(readerHeading, '{reader}과 함께 관상을 봅니다.'");
    expect(read('face-reading-shell.js')).toContain("element.replaceChildren(");
    expect(read('face-reading-shell.js')).toContain("element.querySelector('[data-face-reader-name]')");
    expect(read('face-reading.html')).toContain('data-face-reader-heading');
    expect(read('src/my/MyPage.tsx')).toContain('uiLabel(account.message)');
    expect(read('src/my/MyPage.tsx')).toContain('uiLabel(birth.message)');
    for (const screen of screens) expect(read(screen).length).toBeGreaterThan(100);
  });
  it('never translates unrecognized user input, official interpretations or stored records', () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(translateStaticUi('내가 작성한 상담 메시지, 임의 내용 123', locale)).toBe('내가 작성한 상담 메시지, 임의 내용 123');
      expect(translateStaticUi('공식 사주 결과의 임의 본문 456', locale)).toBe('공식 사주 결과의 임의 본문 456');
    }
    expect(read('records-page.js')).toContain("nameNode.dataset.recordsSource = ''");
    expect(read('ui-i18n.js')).toContain('[data-chat-body-source]');
    expect(read('ui-i18n.js')).toContain('[data-official-reading]');
  });
});
