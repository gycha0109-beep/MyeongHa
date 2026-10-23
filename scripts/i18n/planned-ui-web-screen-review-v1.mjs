import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLANNED_STATIC_UI_COPY_V1 } from '../../apps/web/ui-i18n-planned-copy-v1.js';

/** Partial reviewed UI literal attribution; NOT complete JSX/runtime inspection. */
export const REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1 = Object.freeze([
  Object.freeze({ screen: 'home', path: 'apps/web/src/home/HomePage.tsx', keys: Object.freeze(["대화로 가기 →","전체 사주","이어갈 대화","대화 기록","오늘 이야기할 사람 · 캐릭터 선택","누구와 이야기를 시작해 볼까요?","이번 달 사주 읽기","이달에는 전체 사주 프리뷰부터 시작해 보세요.","오늘도 명하에 이야기가 쌓이고 있어요.","마음에 맞는 사람을 고른 뒤, 지금 가장 마음에 걸리는 이야기를 편하게 꺼내보세요.","현재 월간 해석은 준비 중입니다. 검증된 전체 사주 프리뷰의 제공 상태를 상세 화면에서 확인할 수 있습니다.","지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다."]) }),
  Object.freeze({ screen: 'auth', path: 'apps/web/src/auth/AuthPage.tsx', keys: Object.freeze(["계정 연결","계정을 만드는 중…","로그인하는 중…","계정 인증","인증 방식","소셜 로그인","비밀번호 확인","Google로 계속","카카오로 계속","네이버로 계속","회원가입","또는 이메일로 계속","비밀번호","기존 계정으로 로그인"]) }),
  Object.freeze({ screen: 'chat-hub', path: 'apps/web/src/chat-hub/ChatHubPage.tsx', keys: Object.freeze(["연결자들","이어갈 대화","사람 찾기","이름이나 분위기로 찾아보세요","조건에 맞는 사람을 찾지 못했습니다.","다른 사람 더 보기","다른 연결자 만나기","이어갈 대화와 내 대화","지금 이어갈 사람","이어진 이야기","이야기 이어가기","내 대화","전체 보기 →","나에게 온 이야기","대화 목록 연결 상태","이어지는 대화","이곳에서 마음이 가는 연결자를 만나보세요.","말하는 방식도, 분위기도 조금씩 다른 명하의 연결자들. 마음이 가는 사람을 선택해보세요.","아직 이어지는 대화가 없습니다. 마음에 드는 연결자와 이야기를 시작해보세요."]) }),
  Object.freeze({ screen: 'chat', path: 'apps/web/src/chat/ChatPage.tsx', keys: Object.freeze(["서버 확인 중","대화를 불러오는 중입니다…","대화 상대를 확인하고 있습니다.","대화 다시 연결하기 →","이어진 이야기","대화 상대","캐릭터 대화 공간","캐릭터 공간","대화 상대의 공간","현재 대화","메시지를 입력하세요…","메시지 보내기"]) }),
  Object.freeze({ screen: 'my', path: 'apps/web/src/my/MyPage.tsx', keys: Object.freeze(["로그아웃","로그아웃 중…","계정 연결","계정 관리","계정 유형","계정 상태","로그인 이메일","회원 계정 연결하기 →","이어지는 대화","도움말 · 고객지원","자주 묻는 질문","기록 보러 가기 →","관상 화면 보기 →","계정 연결 화면 →","내 정보를 불러오는 중입니다…","내 정보 관리","오늘의 나","출생 정보 입력하기 →","태어난 시간","출생 정보 수정 준비 중","내 흐름","내 사주","내 기록","최근 이어진 것","계정 정보를 확인하는 중입니다…","회원 계정은 어디서 연결하나요?","저장된 본인 출생 정보가 없습니다.","최근 활동의 실제 내용은 각 화면에서 확인하고, 여기서는 바로 이어갈 길만 보여줍니다.","현재 저장된 계정 정보를 조회하는 화면입니다. 프로필 변경 및 회원 탈퇴 요청은 검증된 서버 절차가 연결되기 전까지 이 화면에서 실행하지 않습니다.","저장한 사주 해석은 어디서 확인하나요?","관상에 선택한 사진은 어디에 사용되나요?","현재 관상 화면은 브라우저에서 사진을 미리 확인하는 단계이며, 사진 분석 기능은 아직 연결되지 않았습니다."]) }),
  Object.freeze({ screen: 'reading', path: 'apps/web/src/reading/ReadingPage.tsx', keys: Object.freeze(["출생 연도","출생 월","출생 일","달력 기준","내 사주 만들기","사주 읽기 주제","아직 등록된 사주가 없습니다.","계산된 내 사주","계산 결과 확인 중","나를 읽기","나를 더 깊이 이해하는 시간","고민이 있다면","지금 고민으로 보기","추가 입력 준비 중","내 사주","내 명식","내 명식과 사주 읽기 주제를 한곳에 모아봤어요.","프리뷰 확인은 현재 제공 가능한 검증용 읽기이며, 정식 Reader 해석과는 다릅니다. 준비 중인 주제는 상세 화면에서 제공 상태를 확인할 수 있습니다.","태어난 정보를 입력하면 명하가 현재 세션의 자기 명식을 계산합니다. 로그인하지 않아도 먼저 확인할 수 있습니다.","게스트로 먼저 볼 수 있으며, 저장·동기화가 필요할 때 계정 연결을 사용합니다.","현재 자기 Birth Profile과 연결된 계산 결과입니다.","확정된 계산 사실만 표시합니다.","이 영역은 계산된 명식 사실만 보여줍니다. 의미 해석은 별도 Reading에서 제공합니다."]) }),
  Object.freeze({ screen: 'records', path: 'apps/web/src/records/RecordsPage.tsx', keys: Object.freeze(["태어난 순간의 기록","기록을 불러오는 중입니다…","현재 기록 주체","호칭 미설정","현재 기록","명식록 추가","내 정보","기록 종류","사주 기록","현재 저장된 기억을 확인합니다.","캐릭터가 삭제된 후 남는 기억 범위는 서로 다를 수 있습니다.","현재 계정에 확인되어 남아 있는 삶의 사실을 시간 순서대로 봅니다.","완료되어 저장된 사주 풀이 이력을 삶의 사실과 분리해 확인합니다."]) }),
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
