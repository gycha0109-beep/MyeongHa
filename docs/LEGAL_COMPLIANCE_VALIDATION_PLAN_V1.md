# 명하 법무·규제 준수 트랙 — 단계별 구현 검증·출시 수락 계획 v1

> 대상: PR [#2504](https://github.com/gycha0109-beep/MyeongHa/pull/2504), 브랜치 `fix/legal-compliance/ai-disclosure-and-launch-audit-20261023`. 이 문서는 검증 **절차**이며 통과 증명이 아니다. **구현을 모두 끝내기 전에는 CI Integration, main 병합, 판매/인증/공식 정책 게시를 수행하지 않는다.**

## 0. 원칙 및 증거 기록

1. 검증 단계는 `S0 기능 구현 → S1 수정 범위 단위·정적 검증 → S2 격리 DB·공급자 모의 계약 → S3 실제 웹/모바일 비결제 동선 → S4 최종 통합 CI → S5 사용자 승인 후 운영 실증` 순서다. 구현 중 필수 단위 테스트는 가능하며, **S4 최종 통합은 코드/관련 소유 트랙 수락 조건이 충족된 후 딱 한 후보 SHA**로 시작한다.
2. 각 단계에서 `PR 번호, 정확한 head SHA, base SHA, 명령/워크플로, 실행 ID 및 URL, 성공·실패, 확인한 로그/산출물`을 기록한다. 다른 브랜치·main·이전 SHA의 GREEN은 통과 증거로 재사용하지 않는다. 자동 실행된 외부/공용 CI를 현재 트랙 중단 사유로 사용하지 않는다.
3. 모든 테스트는 합성 계정·키와 네트워크 격리를 우선한다. PortOne **실인증·과금 요청 없음**, 실제 결제/환불 호출 없음, 운영 DB 마이그레이션/데이터 파기 없음. 비밀키, 원문 대화·출생일, CI/DI, 휴대전화·PG 영수증을 증거 로그에 기록하지 않는다.
4. `supabase/proposals/1740_*.proposed.sql` 및 `1741_*.proposed.sql`은 **수동 승인 전 운영 적용 불가**. 기준 삭제 처분 `59 = 46 DELETE / 4 ANONYMIZE / 9 RETAIN`, SHA256 `c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b`, P5Y/P30D는 원본 승인값 그대로 유지한다.
5. 사용자 승인이 필요한 운영·정책 사항은 별도로 집계한다. 승인 미확정은 코드 검증 실패로 둔갑시키지 않되 **출시 수락은 HOLD**한다.

## S0. 기능 구현 및 범위 고정

- L1 삭제/복원은 [Privacy #2318](https://github.com/gycha0109-beep/MyeongHa/pull/2318), [합성 E2E #2488](https://github.com/gycha0109-beep/MyeongHa/pull/2488)의 기존 소유를 존중한다. 권리행사 실제 접수처·인증·영수 기록과 운영 백업 비재노출은 미확정으로 남긴다.
- L2 회원/게스트/소셜 A1, PortOne 검증 결과 1회 소비, 기존 회원 로그인, 오류 복구 및 네이버 브리지 A1 안전성을 **코드/테스트로** 채운다. 계약 미확정이면 네이버/실인증은 OFF 유지.
- L3 활성 외부 전송 목적지·사업자·재위탁·국외 이전 항목·삭제/로그/학습 조건을 실제 관측 가능한 메타데이터와 대조한다. 계약 및 환경변수 비밀값을 추측하지 않는다.
- L4/S7 실제 판매 단위의 계약/가격/사전 정보·시험 제공/확인/인도/환불 요청·철회 이벤트는 Commerce/S7 소유로 인수한다. `LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1` 고정 OFF는 수락할 권위가 연결되기 전 해제하지 않는다.
- L5 대문·대화·Reading·Native AI 고지/다국어/접근성을 코드에서 닫는다. LEGAL-001/002/003은 승인 전 계속 초안이다.

## S1. 필요한 범위만 우선 검증 — 최종 통합 아님

기준: 저장소 `package.json`에 정의된 Node.js 24, npm 11, Vitest 4. 동일 SHA 체크아웃 환경에서 아래 명령을 순서대로 실행하고 실패 시 **해당 구현만** 수정한다.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test --   apps/api/src/supabase-auth-http.test.ts   test/legal-portone-preenrollment-social-v1.test.ts   test/legal-portone-preenrollment-member-signup-v1.test.ts   test/legal-portone-preenrollment-v1.test.ts   test/legal-portone-preenrollment-dispatch-v1.test.ts   test/legal-production-adult-purchase-hold-v1.test.ts   test/commerce-digital-reading-withdrawal-review-v1.test.ts   test/legal-seyeon-external-egress-evidence-v1.test.ts   test/legal-ai-disclosure-surface.test.ts
```

수락: TypeScript 오류 0, 표적 테스트 실패 0. 음성 테스트에는 미인증/14세 미만/직접 구매 미성년, 만료·복제·타인 소유 PortOne ID, Auth upstream 성공 뒤 Member 결속 실패, 서버 미결속 OAuth state, 기존 OFF 인증 호환, 민감 payload/토큰 무출력, 제3자 Gateway 모델 차단 및 유료 판매 503이 포함된다.

## S2. 격리형 PostgreSQL 17/A1 동시성 — Production과 절대 분리

- 대상: `scripts/ci/db-suites.json`의 `postgres17` / `portone-identity-age-authority-pg17`. 실제 실행 경로는 `test/db/run_ci_case.sh` → `test/db/portone_identity_age_authority_pg17.sh`.
- `test/db/portone_identity_age_authority_pg17.sh`는 **GitHub Actions + CI + DB_SUITE=postgres17 + localhost:5432 + 이름이 `myeongha_ci_case_숫자`인 일회성 데이터베이스**를 확인하며, Production 자격증명 관련 환경이 있으면 즉시 거절한다. 조건을 우회하거나 운영 DB에 적용해 검증하지 않는다.
- A1의 1740/1741 제안 SQL은 이 폐기형 DB에만 실행한다. 수락: RLS/ACL, 연령 밴드, 서버 ID 발급/10분 TTL/물리정리, 인증 일회성 소비, 회원·게스트 원자 결속, 신규 Auth UUID 직접 우회 거절, 동시 중복 소비 단 1건 성공, 계정 삭제·Guest merge 후 증명 재노출 0.
- S2는 L2 관련 코드가 준비된 후 **해당 SHA의 격리 suite**를 확인한다. 워크플로 수동 dispatch가 기본 브랜치 코드를 검사하는 경우 이를 PR head 통과 증거로 쓰지 않는다. PG17 GREEN 미확인 시 L2 완료 아님.

## S3. 출시 전 Web/Native·입력/정보 경계 E2E (비상업 합성 환경)

- Web: 가입 전 A1 서버 capability OFF면 SDK/제3자 네트워크 0, ON 합성 환경이면 본인인증 시도→서버 재조회→단 1회 소비→이메일/소셜/게스트 진입. 기존 회원은 로그인·탈퇴/권리행사 접근 유지, 만료/복제/타인 증명은 차단. 리디렉션 후 SameSite 쿠키가 전송되는지 **실제 브라우저 네트워크 패널**로 확인한다.
- Social: Google/Kakao 기존 verified 회원과 신규 Member를 분리하고 state 위조·중복·다중 탭 경합·외부 redirect 공격·로그/쿠키 토큰 유출을 검사한다. 네이버 A1 브리지 미지원 시 **시작 전에 안전한 보류 메시지**, 외부 리디렉션 0.
- UI: 진입 이전 AI 고지, 대화/Reading/Native에서 생성 결과·비실재 캐릭터 고지, 일본어·번체중국어·한국어, 키보드/스크린리더, 모바일 화면에서 고지가 숨지 않는지 실제 렌더링 확인한다. 기존 `web-browser-auth-regression.yml`은 Web 회귀, `mobile-pr.yml`은 Native 번들 후보이며 결과는 실행 SHA와 함께 확인한다.
- L4: 결제 전 고지·사전 정보/미리보기·단건 분리가 관측되는지, 미제공/하자/중복결제/가분적 미제공 환불 접수 접근이 결제보다 어렵지 않은지, **사전 고지→고객 확인→실제 구매→실제 제공**의 서버 사건 순서·반례를 합성 검증한다. 클라이언트 `read_at`, 내부 T2 COMMIT, AI 생성 완료는 인도 증거로 보지 않는다. 환불·Grant 변경은 Commerce 권위 없이 수행하지 않는다.
- L3: 외부 API 호출 대상과 실제 사용되는 payload **필드 이름/형태만** 확인, 공급자·국가·위탁/이전 법적 근거·DPA·보존/학습/삭제 지원을 소스와 운영 계약 증거로 대조한다. 미확인 항목은 미확인으로 남긴다.

## S4. 전 기능 구현 이후 단 한 번의 최종 통합 검증

**시작 조건:** L1–L5 범위에서 구현 가능한 코드/소유 트랙 연계가 끝나고, 정식 게시/과금/DB 변경을 요구하지 않는 모든 안전 회귀가 통과한 상태. 실행 전에 main 충돌을 해결하고 PR head/base를 고정한다. 기존 Draft PR을 먼저 merge하지 않는다.

- `.github/workflows/ci-integration.yml`의 `workflow_dispatch` 입력 `pr=2504`, `head_sha=<검증할 정확한 PR SHA>`, `base_sha=<검증할 정확한 main SHA>`. 반드시 같은 PR #2504와 직전 확인한 SHA를 대상으로 실행한다. 자동 제공되는 일반 CI 결과를 **핀 고정된 Integration 후보의 GREEN**으로 대체하지 않는다.
- 수락: `CI Integration Verify` **success** 및 그 하위 TypeScript/전체 Vitest/웹 빌드·배포 구성/DB 15·17/모바일 관련 필수 잡 성공. 하나라도 누락·실패·취소·SHA 변동이면 **통합 완료가 아니다**. 실패 범위만 수정해 새 후보 SHA로 다시 검증한다.
- 검증 링크: [PR Checks](https://github.com/gycha0109-beep/MyeongHa/pull/2504/checks), [CI Integration 워크플로](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/ci-integration.yml). 전체 워크플로가 3개 이상이면 PR Checks 하나로 상태 공유한다.

## S5. 운영 적용/법적 게시 및 사용자 승인 이후 별도 실증

운영 DB 제안 SQL/삭제 delta 승인, PortOne 본인확인 채널·계약, 개인정보 처리방침의 실제 외부처리·권리행사 접수 수단, 실결제/환불 계약 및 유료 상품정보는 **사용자 의사결정 또는 외부 증거**가 필요하다. 사전 검증/합성 통과만으로 승인되었다고 선언하지 않는다. 실제 결제·본인확인·정책 게시·운영 DB 변경은 사용자 지시 없이는 실행하지 않는다.

## 현 검증 증거 현황 (2026-10-25)

| 구간 | 근거 자료 | 판정 |
| --- | --- | --- |
| S0 구현 | PR #2504 코드 및 Roadmap §1–27 | 진행 중, 완료 미선언 |
| S1 표적 단위·TypeScript | 대상 테스트 소스는 준비됨 | **최신 head 실행/통과 미확인** |
| S2 PG17 A1 | 격리 스크립트/CI 매니페스트 존재 | **GREEN 미확인** |
| S3 사용자 동선/계약 | 코드·초안 일부 존재 | **실렌더링/운영 계약 미확인** |
| S4 CI Integration | 워크플로 존재, 기존 PR Draft | **의도적으로 미실행** |
| S5 Production/법적 게시 | 승인·실증 필요 | **HOLD** |

완료 조건은 통합 GREEN **만**이 아니라 소유 트랙 결과·인증·실제 배송/환불·삭제/복원·법무 공개 문구·운영 증거의 교차 확인이다.
