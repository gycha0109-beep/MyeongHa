import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLANNED_STATIC_UI_COPY_V1 } from '../../apps/web/ui-i18n-planned-copy-v1.js';

/** Partial reviewed UI literal attribution; NOT complete JSX/runtime inspection. */
export const REVIEWED_WEB_SCREEN_STATIC_UI_KEYS_V1 = Object.freeze([
  Object.freeze({ screen: 'home', path: 'apps/web/src/home/HomePage.tsx', keys: Object.freeze(["누구와 이야기를 시작해 볼까요?","이번 달 사주 읽기"]) }),
  Object.freeze({ screen: 'chat-hub', path: 'apps/web/src/chat-hub/ChatHubPage.tsx', keys: Object.freeze(["이야기 이어가기","내 대화","대화 목록 연결 상태"]) }),
  Object.freeze({ screen: 'chat', path: 'apps/web/src/chat/ChatPage.tsx', keys: Object.freeze(["대화 상대","메시지"]) }),
  Object.freeze({ screen: 'my', path: 'apps/web/src/my/MyPage.tsx', keys: Object.freeze(["호칭","자주 묻는 질문","기록 보러 가기 →"]) }),
  Object.freeze({ screen: 'reading', path: 'apps/web/src/reading/ReadingPage.tsx', keys: Object.freeze(["추가 입력 준비 중"]) }),
  Object.freeze({ screen: 'records', path: 'apps/web/src/records/RecordsPage.tsx', keys: Object.freeze(["호칭"]) }),
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
