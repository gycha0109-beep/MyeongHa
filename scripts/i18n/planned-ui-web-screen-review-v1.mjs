import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLANNED_STATIC_UI_COPY_V1 } from '../../apps/web/ui-i18n-planned-copy-v1.js';

/** Partial reviewed UI literal attribution; NOT complete JSX/runtime inspection. */
export const REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1 = Object.freeze([
  Object.freeze({ screen: 'home', path: 'apps/web/src/home/HomePage.tsx', keys: Object.freeze(["대화로 가기 →","전체 사주","이어갈 대화","대화 기록","오늘 이야기할 사람 · 캐릭터 선택","누구와 이야기를 시작해 볼까요?","이번 달 사주 읽기","이달에는 전체 사주 프리뷰부터 시작해 보세요."]) }),
  Object.freeze({ screen: 'auth', path: 'apps/web/src/auth/AuthPage.tsx', keys: Object.freeze(["계정 연결","계정을 만드는 중…","로그인하는 중…","계정 인증","인증 방식","소셜 로그인","비밀번호 확인","Google로 계속","카카오로 계속","네이버로 계속","회원가입","또는 이메일로 계속","비밀번호","기존 계정으로 로그인"]) }),
  Object.freeze({ screen: 'chat-hub', path: 'apps/web/src/chat-hub/ChatHubPage.tsx', keys: Object.freeze(["연결자들","이어갈 대화","사람 찾기","이름이나 분위기로 찾아보세요","조건에 맞는 사람을 찾지 못했습니다.","다른 사람 더 보기","다른 연결자 만나기","이어갈 대화와 내 대화","지금 이어갈 사람","이어진 이야기","이야기 이어가기","내 대화","전체 보기 →","나에게 온 이야기","대화 목록 연결 상태","이어지는 대화"]) }),
  Object.freeze({ screen: 'chat', path: 'apps/web/src/chat/ChatPage.tsx', keys: Object.freeze(["서버 확인 중","대화를 불러오는 중입니다…","대화 상대를 확인하고 있습니다.","대화 다시 연결하기 →","이어진 이야기","대화 상대","캐릭터 대화 공간","캐릭터 공간","대화 상대의 공간","현재 대화","메시지를 입력하세요…","메시지 보내기"]) }),
  Object.freeze({ screen: 'my', path: 'apps/web/src/my/MyPage.tsx', keys: Object.freeze(["로그아웃","로그아웃 중…","계정 연결","계정 관리","계정 유형","계정 상태","로그인 이메일","회원 계정 연결하기 →","이어지는 대화","도움말 · 고객지원","자주 묻는 질문","기록 보러 가기 →","관상 화면 보기 →","계정 연결 화면 →","내 정보를 불러오는 중입니다…","내 정보 관리","오늘의 나","출생 정보 입력하기 →","태어난 시간","출생 정보 수정 준비 중","내 흐름","내 사주","내 기록","최근 이어진 것","계정 정보를 확인하는 중입니다…","회원 계정은 어디서 연결하나요?"]) }),
  Object.freeze({ screen: 'reading', path: 'apps/web/src/reading/ReadingPage.tsx', keys: Object.freeze(["출생 연도","출생 월","출생 일","달력 기준","내 사주 만들기","사주 읽기 주제","아직 등록된 사주가 없습니다.","계산된 내 사주","계산 결과 확인 중","나를 읽기","나를 더 깊이 이해하는 시간","고민이 있다면","지금 고민으로 보기","추가 입력 준비 중","내 사주","내 명식"]) }),
  Object.freeze({ screen: 'records', path: 'apps/web/src/records/RecordsPage.tsx', keys: Object.freeze(["태어난 순간의 기록","기록을 불러오는 중입니다…","현재 기록 주체","호칭 미설정","현재 기록","명식록 추가","내 정보","기록 종류","사주 기록"]) }),
]);

export function auditReviewedWebScreenSourceV1(screen, source, stagedKeys) {
  const keys = new Set(screen.keys), staged = new Set(stagedKeys);
  if (keys.size !== screen.keys.length) throw new Error('Duplicate reviewed key: ' + screen.screen);
  return Object.freeze({
    screen: screen.screen,
    sourceMissingKeys: Object.freeze(screen.keys.filter(k => !source.includes(k))),
    unstagedKeys: Object.freeze(screen.keys.filter(k => !staged.has(k))),
    renderedStateReviewComplete: false,
    readyForRelease: false,
  });
}

export async function auditCurrentReviewedWebScreensV1(root) {
  const screens = await Promise.all(REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1.map(async screen =>
    auditReviewedWebScreenSourceV1(
      screen,
      await readFile(resolve(root, screen.path), 'utf8'),
      PLANNED_STATIC_UI_COPY_V1.keys(),
    ),
  ));
  return Object.freeze({
    screens: Object.freeze(screens),
    selectedLiteralsAligned: screens.every(s => !s.sourceMissingKeys.length && !s.unstagedKeys.length),
    pageRouteClassificationComplete: false,
    privateDynamicDataInspected: false,
    readyForRelease: false,
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const summary = await auditCurrentReviewedWebScreensV1(fileURLToPath(new URL('../../', import.meta.url)));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}
