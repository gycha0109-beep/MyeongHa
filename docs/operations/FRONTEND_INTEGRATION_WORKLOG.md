# 명하 프론트엔드 통합 트랙 WORKLOG

- Track: `frontend-integration`
- 기준 저장소: `gycha0109-beep/MyeongHa`
- 로드맵: `docs/WEB_USER_JOURNEY_HARDENING_PLAN_2026-10-08.md` (Stage 1~5)
- 디자인 기준: `docs/CORE_VISUAL_SYSTEM_V0.1.md` (Paper / Ink / Night / Brass / Seal)
- 범위: 승인된 기존 디자인을 유지하고, Stage 5의 라이트·다크 가독성/접근성 미완료 항목을 순서대로 정리. 신규 기능·해석 권한·결제 활성화 없음.

## 로드맵 상태 (2026-11-08 확인 기준)

| 구간 | 확인된 상태 | 근거 / 제약 |
| --- | --- | --- |
| Stage 1 — 탐색·진입 | 과거 구현 기록 존재. 현재 운영 완료를 별도로 추정하지 않음 | 기존 웹 로드맵의 Stage 1 설명 |
| Stage 2 — 공식 Reading/Reader | 차단 조건 존재 | 공식 Reading/Reader 권한 및 배포 게이트 |
| Stage 3 — 결제 UX | 차단 조건 존재 | Commerce/운영 권한 및 실제 결제 경로 |
| Stage 4 — 관상 사진 흐름 | 차단 조건 존재 | 승인된 intake·privacy·엔진 경계 |
| Stage 5 — 웹 출시 점검 | 진행 중, **라이트·다크 가독성 1개 단위 수정** | 반응형·명암 대비·오류·접근성·실사용 흐름 점검 항목이 남음 |

## 2026-11-08 — 공통 라이트/다크 가독성 1개 단위

### 실제 변경

- `apps/web/product-clarity.css` — 공통 보조 글씨 대비 강화, 본문 기본 16px, 작은 안내문 최소 14px, 상품 설명 15px, 긴 글 문단 간격 개선. 기존 명조 제목/고딕 본문 역할, 배경·캐릭터 자산, 서비스 기능은 유지.
- `apps/web/product-clarity.css` — 사주 비선택 탭, 무료 예시 배지, 상품 버튼의 라이트/다크 대비 및 조작 가능한 크기 개선.
- `apps/web/product-clarity.test.ts` — 실제 CSS 선언을 읽어 주요 라이트/다크 텍스트 대비 4.5:1 이상을 확인하는 회귀 테스트 추가.
- `docs/operations/FRONTEND_INTEGRATION_WORKLOG.md` — 본 이력 신설 (기존 트랙별 WORKLOG 없음 확인).

### 커밋

- CSS 수정: `b5d48b2534ab4fefcc0aa1e03e8aed6c049a5f2e`
- 대비 테스트 추가: `4ed35206b52c854ce7f06457393ad8885e285229`
- 첫 CI의 타입 검사 오류 수정: `22b8e5fe8dbfde90a5f4fe08015b00368dba4dd5`
- 코드·테스트 커밋 모두 `Watchtower-Track: frontend-integration` 기록.

### 검증 증거

- 선언 기반 실제 색상 대비 계산 (WCAG 2.2 AA 일반 텍스트 기준 4.5:1):
  - 라이트 보조 문구: **7.43:1**
  - 다크 보조 문구: **7.44:1**
  - 다크 비선택 탭: **8.52:1**
  - 라이트 예시 배지: **8.15:1**
  - 다크 예시 배지: **5.91:1**
  - 다크 상품 버튼: **8.50:1**
- GitHub 브랜치의 변경된 CSS와 테스트 파일을 다시 읽어 선언·대비 수치 일치 확인.
- PR: [#3116](https://github.com/gycha0109-beep/MyeongHa/pull/3116), [PR 체크](https://github.com/gycha0109-beep/MyeongHa/pull/3116/checks).
- 최초 PR CI [실행 #42390556226](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390556226): **FAIL**, 새 대비 테스트의 strict TypeScript 미정의 배열/매치 인덱스 오류. 원인은 본 작업 파일로 확인했고 위 `22b8e5f` 커밋에서 접근 방식을 수정함.
- 최초 Governance [실행 #42390556039](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390556039): **PASS**. 웹 PR 검증 [실행 #42390556104](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390556104): 정적 웹 빌드 성공 후 브라우저 점검 진행 중으로 확인.
- **수정 커밋 이후 전체 CI / 브라우저 재검증은 결과 미확인**. 수치 계산이나 예전 SHA의 성공으로 전체 페이지 WCAG 또는 수정본 CI 통과를 주장하지 않음.

### 2026-11-08 이어서 — 이전 가독성 작업 CI 오류 수정 (같은 단위)

- **수정 파일:** `test/web-product-clarity.test.ts` — 기존 회귀 테스트가 CSS의 옛 `13px` 최소값을 하드코딩하여 실패하므로, 이미 구현된 `14px` 최소값으로 기대치를 갱신. 제품 UI/CSS 기능 추가 없음.
- **수정 커밋:** `303a214d94fd7ef2eaa77307f4e4a97b3822c6fa` (`Watchtower-Track: frontend-integration`).
- **실패 원인 증거:** 이전 HEAD `d1b8b5f`의 [CI #42390762076](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390762076)은 변경된 신규 대비 테스트 2건 통과, 기존 `test/web-product-clarity.test.ts`의 `expect(css).toContain('font-size: max(13px, .8125rem);')` 1건 실패(2079 passed, 1 failed). 같은 SHA의 [Governance #42390761825](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390761825) PASS, 웹 브라우저 [#42390761874](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42390761874)는 새 커밋 발생으로 취소됨.
- **수정 확인:** 브랜치의 실제 `product-clarity.css`에 `max(14px, .875rem)`가 있고, 테스트 기대치와 일치하도록 수정. **새 커밋의 TypeScript·테스트·브라우저 CI는 통과 확인 전까지 미검증.**
- **미완료:** PR #3116 최신 HEAD CI 성공 및 auto-merge 증거 확보, 이후 Stage 5의 실브라우저 모바일/반응형 가독성 점검.
- **다음 작업:** 최신 PR 체크 완료/실패를 기준으로 해당 가독성 단위를 종료하거나 이 단위의 오류만 수정. 성공 후 기존 Stage 5의 실브라우저 모바일 레이아웃 확인.
- **승인:** 사용자 추가 승인 필요 없음.

### 미완료 / 다음

- **미완료:** Stage 5의 실브라우저·모바일·반응형/텍스트 잘림·나머지 접근성 및 기능 흐름 점검. Stage 2~4의 별도 권한/운영 차단은 이 CSS 수정으로 해소되지 않음.
- **다음:** 기존 Stage 5의 실브라우저 라이트·다크/모바일 대비 및 레이아웃 점검으로 이어가되, 현재 PR CI 결과부터 확인.
- **승인 대기:** 없음. 신규 상품·기능·의미 권한 변경 없음.

## 2026-11-08 — 좁은 모바일 화면 읽기·탐색 가독성 (Stage 5)

- **목표/기존 작업:** `docs/WEB_USER_JOURNEY_HARDENING_PLAN_2026-10-08.md` Stage 5의 반응형 화면, 라이트·다크 대비·접근성 점검 중 다음 미완료 단위. 기존 승인된 디자인 및 화면 기능 그대로 유지.
- **선행 확인:** 직전 가독성 PR [#3116](https://github.com/gycha0109-beep/MyeongHa/pull/3116)은 2026-11-08 KST 병합 확인. 같은 HEAD `6cdd3e2e`에서 [PR 체크](https://github.com/gycha0109-beep/MyeongHa/pull/3116/checks)의 Governance, CI, Web PR Domain Gates 모두 success. 필수 [Integration #42392030772](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42392030772)도 success (실제 병합 완료로 직전 단위 종료).
- **변경 파일:**
  - `apps/web/shared-product-header.css`: 350px 이하 공통 헤더의 좌우 폭 확보. 기존 헤더 높이/배색/메뉴 수는 변경 없음.
  - `apps/web/product-clarity.css`: 대화 허브의 기다림 안내문을 최소 14px 가독성으로 조정.
  - `scripts/verify-web-browser-render.mjs`: 기존 390px 모바일 렌더 검증에 320px 실제 Chrome 뷰포트 5개 메뉴 화면의 브랜드/유틸리티 겹침, 하단 6개 메뉴, 수평 오버플로, 대화 안내 문구 글씨 크기 확인 추가.
- **브랜치:** `fix/frontend-integration/mobile-readability-stage5-20261108`
- **코드 커밋:** `7c6ff383b39e2ddf88967320062c3210763c0d3b`, `eb1131f4e1f21178bcf1d091611f8a07a407fbea`, `784b6feef4ef97ab2cb92437d692b334f0de31c2`.
- **PR:** [#3121](https://github.com/gycha0109-beep/MyeongHa/pull/3121) (`frontend-integration`).
- **코드 검사:** 변경 파일과 GitHub PR diff를 확인함. 320px 검증의 성공·실패, 실제 브라우저 결과 및 CI 통과는 **PR CI 종료 전까지 미확정**. 단순 CSS 수정만으로 전체 WCAG 준수나 모든 모바일 화면 검증 완료를 주장하지 않음.
- **완료:** 320px 헤더 여백·대화 안내문 개선 구현 및 320px 모바일 다섯 화면의 실브라우저 회귀 경로 추가, 소스 커밋.
- **미완료:** [PR 체크](https://github.com/gycha0109-beep/MyeongHa/pull/3121/checks)의 테스트·CI·필수 Integration 통과와 병합 확인, Stage 5 다른 항목(네트워크/세션 만료/기능 E2E/법적 안내 등).
- **블로커·승인:** 추가 사용자 승인 없음. CI 결과가 본 단위 종료의 선행 조건.
- **다음 작업:** 현재 PR 검증에서 실패가 발생하면 해당 모바일 가독성 단위만 보정, 통과 시 기존 로드맵 Stage 5의 다음 미완료 검증으로 이동.

## 2026-11-08 — 대화 허브 고객지원 링크 복구 (Stage 5)

- **작업 목표/근거:** `docs/WEB_USER_JOURNEY_HARDENING_PLAN_2026-10-08.md` Stage 5에서 지정한 고객지원 탐색 경로의 실제 실패 수정. `apps/web/chat-hub.html` 푸터 `고객지원`이 `#`를 가리켜 기존 접수 양식으로 들어가지 못함. 기존 `docs/ROADMAP_CONTACT_INQUIRY.md`에서 문의 접수 운영 연결 완료 기록 확인.
- **선행 완료:** 모바일 가독성 [PR #3121](https://github.com/gycha0109-beep/MyeongHa/pull/3121) 실제 병합(`2026-11-08` KST), 일반 CI·웹 브라우저·Governance 성공, [Integration #42400926140](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42400926140) **success**. 이전 작업의 운영 배포·전체 WCAG 적합성은 이 기록으로 추정하지 않음.
- **변경 파일:** `apps/web/chat-hub.html`(기존 고객지원 링크를 `contact.html`로 변경), `test/web-product-clarity.test.ts`(링크 및 실재하는 문의 양식의 정적 회귀 검사), `docs/operations/FRONTEND_INTEGRATION_WORKLOG.md`(본 이력).
- **브랜치:** `fix/frontend-integration/support-footer-stage5-current-main-20261108`. 처음 구현해 둔 `fix/frontend-integration/support-footer-navigation-stage5-20261108`가 #3121 병합 전 SHA에서 분기된 상태여서, 최신 `main`에서 동일 수정과 테스트만 재적용함. 중복 변경 없는 비교 결과(코드/테스트 2파일, 뒤처진 커밋 0개) 확인.
- **코드·테스트 커밋:** `44802d31dc07f4652cee820604923c57ebd1ad78`, `d84d61601473651a190ccec33d85a59c12d70e92`. 앞선 분리 작업 원본 커밋 `c3e3baaaedd4ae3f39934914b5f9c86f6f856056`, `ff9fbd1f630dbe88ec4a6495476acce6e7bf3834`. 모두 동일 트랙.
- **PR:** [#3125](https://github.com/gycha0109-beep/MyeongHa/pull/3125) (`frontend-integration`). [체크 페이지](https://github.com/gycha0109-beep/MyeongHa/pull/3125/checks).
- **코드 검증:** 새 브랜치와 최신 `main` 비교에서 고객지원 HTML과 기존 Vitest 회귀 테스트만 변경된 것을 확인. 실제 테스트/빌드/웹 브라우저 CI·통합 CI는 **PR의 최신 SHA 검사 완료 전까지 미확인**. 성공을 추정하지 않음.
- **완료:** 기존 문의 양식 진입 링크 수정, 회귀 검사 및 본 WORKLOG 코드와 함께 커밋, PR 생성.
- **미완료:** PR #3125 TypeScript·테스트·웹 브라우저·Governance 및 필수 통합 CI 통과, 실제 병합 증거. Stage 5의 남은 법무/개인정보/환불 탐색과 운영 경로·실사용 E2E는 별도 차단/검증 조건 확인 필요.
- **블로커·승인:** 추가 사용자 승인 없음. 필수 CI 완료는 PR 병합 선행 조건.
- **다음 작업:** PR #3125의 최신 CI 결과 확인, 실패 시 이 링크 단위만 수정; 전부 Green이면 기존 방식으로 통합 검증 제출 및 병합 확인 후 Stage 5 다음 미완료 항목 파악.

### 2026-11-08 검증 체크포인트 — 고객지원 링크 (#3125)

- **검증한 작업:** 대화 허브 `고객지원` → 실제 `contact.html` 이동, 문의 양식 존재를 보호하는 회귀 테스트. 기존 브랜치 `fix/frontend-integration/support-footer-stage5-current-main-20261108`, PR [#3125](https://github.com/gycha0109-beep/MyeongHa/pull/3125).
- **실제 변경 파일·코드 커밋:** `apps/web/chat-hub.html` (`44802d31dc07f4652cee820604923c57ebd1ad78`), `test/web-product-clarity.test.ts` (`d84d61601473651a190ccec33d85a59c12d70e92`), 이 WORKLOG.
- **검증 결과 (검증 대상 코드 HEAD `306650c2424dc56397c03c853a73d9bcb7bfa99f`):** [CI #42403340452](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42403340452) **PASS** (`Work Track · frontend-integration` 및 `CI Verify` success); [Web PR Domain Gates #42403340435](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42403340435) **PASS** (`Web PR Verify` success); [Governance #42403340490](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42403340490) **PASS**. 선택되지 않은 DB 검증은 skipped였으며 이를 성공 실행으로 기록하지 않음.
- **완료:** 위 코드 HEAD의 타입/영향 테스트·웹 브라우저·Governance CI 성공 확인, 고객지원 링크 수정 및 회귀 테스트 커밋.
- **미완료:** 이 기록 커밋으로 갱신되는 **최종 PR HEAD**의 체크 결과와 필수 `CI Integration Verify` 성공 및 병합 확인. Stage 5의 나머지 법무/개인정보/환불 공개 경로·실사용 E2E는 별도 미완료이며 본 PR 범위에서 임의 공개하지 않음.
- **블로커/승인:** 사용자 승인 필요 없음. 기존 필수 통합 검증 절차 대기.
- **다음 작업:** 최종 HEAD에서 선행 CI 성공 확인 → 기존 `ci-integration-ready` 절차로 통합 검증 제출 → 성공 시 자동 병합 확인; 실패 시 같은 링크 단위만 보정. 병합 성공 후 로드맵의 다음 미완료 항목 확인.

