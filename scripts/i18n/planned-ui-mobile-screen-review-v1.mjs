import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PLANNED_STATIC_UI_COPY_V1 } from '../../apps/web/ui-i18n-planned-copy-v1.js';

/**
 * Limited mobile JSX route review. The matching mobile staged catalogue is
 * separately required to equal the web catalogue (EN/CN parity contract).
 * This checks literal source keys, NOT rendered locales, states or release.
 */
export const REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1 = Object.freeze([
  Object.freeze({ screen: 'my', path: 'apps/mobile/src/app/(tabs)/my/index.tsx', keys: Object.freeze(["내 정보를 불러오는 중입니다…","나의 계정과 이야기, 설정을 살펴보세요.","내 정보","출생정보"]) }),
  Object.freeze({ screen: 'saju', path: 'apps/mobile/src/app/(tabs)/reading/index.tsx', keys: Object.freeze(["현재 출생정보와 명식을 확인하는 중입니다…","내 명식을 계산하려면 현재 자기 출생정보를 먼저 등록해 주세요.","출생정보 입력하기","사주 읽기","전체 사주","나의 명식","다시 시도","출생정보가 필요합니다","내 명식"]) }),
  Object.freeze({ screen: 'face', path: 'apps/mobile/src/app/(tabs)/reading/face.tsx', keys: Object.freeze(["사진을 준비해 주세요","정면 · 얼굴 전체 · 자연스러운 밝기","▣  사진 촬영","▧  사진 선택","사진을 준비하는 중입니다…","정면 사진 촬영","관상 보기 준비","선택한 얼굴 사진 미리보기","전면 카메라로 정면 사진 촬영","사진첩에서 얼굴 사진 선택","사진 선택","선택한 사진","다시 시도","준비 중","사진 준비"]) }),
  Object.freeze({ screen: 'records', path: 'apps/mobile/src/app/(tabs)/records/index.tsx', keys: Object.freeze(["기록을 불러오는 중입니다…","저장된 기억","지난 읽기"]) }),
  Object.freeze({ screen: 'chat', path: 'apps/mobile/src/app/(tabs)/chat/index.tsx', keys: Object.freeze(["당신은 누구와 이야기하고 싶으신가요?","마음이 가는 인물을 고르세요. 각 연결자의 이야기와 분위기가 다릅니다.","오늘의 이야기를 함께할 연결자","조금 더 준비가 필요한 인물들입니다. 현재 대화는 열 수 없습니다.","캐릭터 소개 준비 중","등록 중","AI 답변 준비 중 · 기록 열람 가능","AI 답변 준비 중","이용 상태는 대화방에서 확인","로그인 후 대화하기  →","회원 상태를 확인하는 중입니다…","AI 서비스 상태 확인 필요","대화 열기","로그인 필요","대화방 열기","여는 중…","준비 중","대화방 열기  →","로그인 후 열기  →","현재 대화"]) }),
  Object.freeze({ screen: 'birth', path: 'apps/mobile/src/app/birth/index.tsx', keys: Object.freeze(["연도 → 월 → 날짜 순서로 선택할 수 있습니다.","윤달로 태어난 경우에만 켜 주세요.","날짜 선택","음력 생년월일","출생 생년월일 달력 열기","시간 모름","생년월일","출생시간","내 사주 보기","사주 보기","양력 생년월일","‹ 사주로 돌아가기","출생정보"]) }),
]);

export function auditReviewedMobileScreenSourceV1(screen, source, stagedKeys) {
  if (new Set(screen.keys).size !== screen.keys.length) {
    throw new Error('Duplicate reviewed mobile key: ' + screen.screen);
  }
  const staged = new Set(stagedKeys);
  return Object.freeze({
    screen: screen.screen,
    sourceMissingKeys: Object.freeze(screen.keys.filter(key => !source.includes(key))),
    unstagedKeys: Object.freeze(screen.keys.filter(key => !staged.has(key))),
    renderedStateReviewComplete: false,
    readyForRelease: false,
  });
}

export async function auditCurrentReviewedMobileScreensV1(repoRoot) {
  const screens = await Promise.all(REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1.map(async screen =>
    auditReviewedMobileScreenSourceV1(
      screen,
      await readFile(resolve(repoRoot, screen.path), 'utf8'),
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
  const report = await auditCurrentReviewedMobileScreensV1(fileURLToPath(new URL('../../', import.meta.url)));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
