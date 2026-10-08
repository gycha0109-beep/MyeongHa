# 사주 브릿지 2A — 일반 원국 프리뷰 화면 표시 계약 검증

> 상태: 내부 검증 전용. Production Interpretation Authority 및 유료 판매 상태는 변경하지 않음.
> 후속: #1728 / 선행: #1726

## 기존 구현 확인
- `POST /api/me/saju/preview-reading`: 서버에서 사용자·현재 출생정보 revision 확인, Saju source-attested transport를 호출.
- `apps/web/reading-character.js`: 일반 원국 `?topic=temperament&scope=original`를 `전체 사주`로 변환하여 기존 Preview HTTP 요청 후 결과를 읽기 화면에 표시.
- `packages/api-client/src/product-reading-display.ts`: 이미 엄격한 state/message/action/section/block vocabulary 파서를 보유.

## 이번 PR 변경
- **새 HTTP endpoint나 새 Product Mapper를 만들지 않음.** 기존 웹 Reading 코드가 Preview delivery를 표시하기 직전에 최소 계약을 다시 확인.
- `apps/web/saju-preview-response-admission.js`: 응답 버전, identity, delivered/state-message-action 조합, 지원되는 block/section/disclosure 종류, 표시 가능한 내용이 있는지를 fail-closed 검사.
- `test/saju-general-natal-preview-ui-admission.test.ts`: route → request → shared API client projection → browser display gate의 합성 테스트 및 오류 거부.
- `scripts/verify-web-general-natal-preview-browser.mjs`: 이미 있는 웹 빌드를 사용한 Chrome browser mock smoke. 정상 원국 표시 / malformed 해석 차단 / 미허가 연간 서버 요청 금지.
- 기존 `web-pr-checks.json`의 사주·전체 검사 목록에 추가. 새로운 GitHub Actions 워크플로를 만들지 않음.

## 권한 경계
- Saju source-owned ProductReadingResponse admission 및 source attestation은 서버의 기존 단일 authority를 유지. 브라우저 검사는 presentation defense-in-depth일 뿐 의미 검증의 최종 권한이 아님.
- API public Preview는 일반 원국/직업/재물/연애/사업의 기존 범위로 유지하고 연간·궁합·프리미엄 운영 확장 없음.
- 외부 데이터, 실제 사주 확정값, 실제 user Birth·Commerce DB를 사용하지 않음. Synthetic mock fixture는 사주 의미 권한이 아님.
- 프리뷰 결과 표시 성공을 상품 출시 승인으로 해석하지 않음.

## 다음 작업
- #1728의 다음 단계는 Approved Reading artifact 및 current birth revision을 결속한 서버 측 복합 읽기/상품 readiness 검증.
- #932 캐릭터 Grounding / #1034 결제·권한은 각 소유 트랙이 담당. 본 PR에서 별도 구현하지 않음.
