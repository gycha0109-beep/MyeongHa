# 명하 설계 권위 충돌 원장 — 2026-10-28

> 분류: **ACTIVE / SUPERSEDED / HISTORICAL / CANDIDATE·HOLD**. 이 문서는 새 아키텍처나 운영 승인서가 아니라 **기존 정본의 적용 범위·충돌·수정 인계 색인**입니다.
> 기준: [MyeongHa main `8a7113204bd2b2d195649e4fbe8797135dee8221`](https://github.com/gycha0109-beep/MyeongHa/commit/8a7113204bd2b2d195649e4fbe8797135dee8221), 2026-10-28 KST. 날짜·SHA가 고정된 증거는 이후 현재 상태를 보증하지 않습니다.
> Watchtower-Track: architecture-authority

## 판정 규칙

1. **같은 도메인** 안에서 명시적 후속 사용자 결정 및 현행 P0 원장이 구형 제안을 대체합니다. 과거 문서의 구조적 안전 불변식은 별도 폐기 결정 없이 사라지지 않습니다.
2. 코드·CI·배포 증거는 **실행 여부**를 증명하되, 미승인 판매·보안 완화·의미론적 권위 승격을 승인하지 않습니다. `OPEN-P0`는 최신 결정 원장에서만 판단합니다.
3. **서로 다른 제품 표면**(캐릭터 일반 채팅, Reader 프리뷰, 유료 Reader, 무료 베타, 정식 결제)은 개방 인원·게이트를 합치지 않습니다.
4. 기존 복구·배포 기록은 HISTORICAL로 보존합니다. 성공한 부분 실험만으로 최신 Production 전체를 PASS로 승격하지 않습니다.

## 충돌·범위 원장

| ID / 판정 | 구형 위치 → 최신 정본·증거 | 영향·심각도 | 처리와 담당 |
|---|---|---|---|
| AR-01 **SUPERSEDED / 잠재 충돌** | 첨부 원본 `Usecase_re_reviewed_v2(1).md` §4의 출시 최소 5명 및 [UX 화면 명세 §2](../UX_SCREEN_STATE_SPEC.md) 범용 Hall 흐름 → [승인된 캐릭터 9명 출시 결정](../source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md) | 신규 출시 계획이 5명으로 축소될 위험 · 높음 | UX의 과거 구조와 출시 인원을 분리. 9명 일반 캐릭터 출시 결정은 ACTIVE; 캐릭터 상세 콘텐츠/실제 공개 준비 완료 주장은 별도 증거 필요 · 본 트랙 |
| AR-02 **ACTIVE / 정상 도메인 분리** | [9명 출시](../source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md) ≠ [세연 우선 Reader 프리뷰](../WEB_READER_STAGED_ROLLOUT_SEYEON_FIRST_V1.md) · [실제 피커](../../apps/web/reader-rollout-policy.js) | 가짜 충돌로 8명 일반 채팅 또는 Reader 유료 개방을 잘못 차단/개방할 위험 · 높음 | 일반 캐릭터 수 9명, Reader **표시용 프리뷰 세연 1명**, 유료 Reader 공개 0명(코드 `READER_PUBLIC_INTERPRETATION_ENABLED_V1=false`)은 각각 별도 게이트. 런타임/결제 권한 수정 없음 |
| AR-03 **ACTIVE + HISTORICAL / 표현 불일치** | [초기 UX §2·§3](../UX_SCREEN_STATE_SPEC.md) Landing→Hall→Chat 개념 → [Reader Knowledge v1.1](../MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md) 세연 안내·무료 경험·Reader 유료 흐름 및 별도 출시 결정 | 최초 방문 화면과 나중의 Reader 구매를 같은 진입선으로 오해 · 중간 | UX의 일반 화면 상태 계약은 유지, 온보딩·무료 베타·판매/Reader 활성은 각각 승인/운영 게이트로 분리 · 본 트랙 |
| AR-04 **HISTORICAL + ACTIVE / 실제 문서 충돌** | [운영 아키텍처 §5](PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) Vercel을 ‘현재’ 기본 진입점으로 기술 → [Cloudflare 우선 운영 정리](../operations/VERCEL_ORIGIN_DEPENDENCY_CLEANUP_20261026.md), [Worker 라우터](../../cloudflare/myeongha-worker.mjs), [wrangler.jsonc](../../wrangler.jsonc), [Cloudflare E2E](../deployment/cloudflare-primary-e2e.md) | 이전 배포/검사기의 Origin을 새 제품 기본 주소로 잘못 사용 · 높음 | 새 제품 기본 공개 Origin은 `https://myeongha.gycha0109.workers.dev`; Vercel은 **존재하는 대기·역사적 경로**(종료 미승인). 9월 §5는 당시 실측 snapshot. 운영 아키텍처 본문은 운영 트랙과 동시 수정 금지 · 본 트랙은 색인/구형 호스팅 문서만 정리 |
| AR-05 **CANDIDATE·HOLD / 잠재 충돌** | [9월 Saju Cloud Run 선택](SAJU_PRODUCTION_HOSTING_DECISION_V1.md) → Cloudflare 무료 운영 지시, [Saju 브릿지 V2](../SAJU_BRIDGE_EXISTING_AUTHORITIES_NO_NEW_ROLES_V2_20261016.md) | Cloudflare 전환을 독립 사주 엔진·Auth·Storage 이전 완료로 착각하거나 승인 없는 유료 Cloud Run 구축 · 높음 | Cloudflare Worker는 제품 API/정적 자산 경로. 별도 HTTPS Saju 서비스의 호스트·호출 비용/실배포·무료 한도는 **현재 승인/입증된 것으로 취급 금지**. 승인 없는 유료 리소스 생성·전환 없음. Cloud Run 선정은 구형 설계 선택 기록이지 현행 증빙된 프로덕션 엔드포인트가 아님 |
| AR-06 **SUPERSEDED + HISTORICAL / 잠재 충돌** | [Saju single-project V1/S3A Permit 계획](../SAJU_BRIDGE_SINGLE_SUPABASE_INTEGRATION_DESIGN_V1.md) · [SO-4 3클러스터](../SAJU_SO4_SUPABASE_ISOLATION_P0.md) → [기존 Auth/역할 재사용 V2](../SAJU_BRIDGE_EXISTING_AUTHORITIES_NO_NEW_ROLES_V2_20261016.md) | 일반 회원 사주 계산에 미승인 새 DB 역할·Permit·3개 유료 클러스터가 필수라고 오해 · 높음 | 일반 사용자 제품 브릿지는 V2 ACTIVE. 기존 S3A SQL은 HISTORICAL 미적용 초안. SO-4는 **다른 고격리 실행 프로파일**로 HOLD 유지, 기존 보안 R01–R14 결과를 위조해 통과시키지 않음 · 브릿지/보안 런타임은 별도 트랙 |
| AR-07 **SUPERSEDED / 잠재 충돌** | [Commerce 출시 레일 결정 §5·§8](../COMMERCE_LAUNCH_RAIL_DECISION_V1.md)의 `P0-CM-02 OPEN` → [현재 P0 원장](../P0_DECISION_REGISTER.md) `P0-CM-02 DECIDED PortOne V2`; `P0-CM-03 OPEN-P0 (activation)` | 결정 완료된 PSP를 재선정하거나 비활성 상품을 판매 · 높음 | 과거 OPEN은 HISTORICAL. Web one-off, PortOne V2 ACTIVE. `standard.love_relationship` 가격 결정은 판매/Offer/권한 활성 허가와 다름 · 본 트랙 문서 보정, Commerce 런타임 비변경 |
| AR-08 **HISTORICAL + ACTIVE HOLD / 실제 CI 충돌** | [DR 검증기](../../scripts/verify-postgres-dr-readiness-authority.mjs)의 `production_schema_latest_deployed_migration: 1310`, 9월 백업/복구 ID 고정 → [DR 최신 status](../operations/POSTGRES_DR_READINESS_STATUS_V1.md) 첫머리의 10/28 한정 복구 성공, [운영 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), [PR #2683](https://github.com/gycha0109-beep/MyeongHa/pull/2683), [PR #2685](https://github.com/gycha0109-beep/MyeongHa/pull/2685) | 현재 스키마와 맞지 않는 9월 상태를 ‘현재’로 검사하여 CI 차단 또는 잘못된 복구 판정 · 매우 높음 | **운영·DR 트랙 인계**. 검증기는 증거 섹션/스코프/신선도/운영 migration lineage를 구별해야 함. 옛 증거는 지우지 말고 과거 스냅샷으로 파싱, 최신 검증 가능한 증거를 별도 contract로 채택. provider-managed full restore, privacy non-resurrection, current-schema parity 미입증이면 `dr_ready=false` 고정. 이 트랙은 코드/DR 문서 미수정 |
| AR-09 **ACTIVE / 표현 불일치 없음** | [SRC-04](../SOURCE_AUTHORITY_GAPS.md)는 `P0-AUTH-01` 결정으로 이미 RESOLVED, [P0 원장](../P0_DECISION_REGISTER.md)도 DECIDED | 해결된 이슈를 다시 `OPEN-P0`로 취급할 위험 · 중간 | 재개방하지 않음. Subject/RLS 보안 불변식 유지 |
| AR-10 **CANDIDATE·HOLD / 정상 도메인 분리** | [Reader Knowledge v1.1](../MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md)의 추가 Reader 구매·예시 가격, [Reader 개인정보 결정](../OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md), [P0-CM-03](../P0_DECISION_REGISTER.md) | 예시 가격·무료 베타·유료 정식 출시를 동일 판매 승인으로 취급 · 높음 | 유료 Reader·추가 해설의 개별 SKU/Offer/Entitlement, 개인정보 운영 승인은 별도. 무료 베타도 유료 활성화 증거가 아님; 현재 결제·권한 fail-closed 유지 |

## 운영·DR 트랙 인계 계약 (AR-08)

- **변경 소유:** `scripts/verify-postgres-dr-readiness-authority.mjs`, `docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md`, 백업·복구 runbook 및 실제 Production migration 대응은 운영·DR 트랙만 수정.
- **현재 재현 지점:** verifier가 위 status 파일의 **9월 HISTORICAL** 섹션에서 `production_schema_latest_deployed_migration: 1310`을 정규식으로 읽고, 현재 `supabase/migrations` 숫자 최댓값과 비교합니다. 이어 9월 `36294430134`, `36295215761`, `35659483080` 등을 고정 문자열로 요구합니다. 따라서 10/28 검증 복구 `40655447574`는 문서에 있더라도 그 증거로 판정되지 않습니다.
- **기대 계약:** 출처가 명시된 **현재 운영 관측 마이그레이션**·로컬 migration frontier·백업의 실제 frontier를 각각 보관/검사. 번호가 다르고 logical name만 같은 migration은 자동 동등성 승인 금지; 불일치면 정확한 원인과 승인 경계를 표시. 모든 run/artifact SHA, 기간, 만료일, recovery scope를 각각 검증하고 역사적 데이터는 증거 목록에만 보존.
- **거부 조건:** 현재 복구가 captured-window-only이면 future-safe privacy reconciliation을 PASS로 승격하지 않음. Hosted Auth/Storage의 3 projected/27 skipped COPY 및 서비스 복구 미검증을 무시하지 않음. RPO `PT24H`, RTO `PT6H`, `dr_ready=false` 유지. 운영 데이터·Schema·백업 삭제/재실행, migration repair 자동 수행 금지.
- **상태:** #1887 OPEN; #2683, #2685는 2026-10-28 기준 main에 병합됨. 이 문서는 해당 이슈 해결 또는 운영 트랙의 PR을 대신하지 않습니다.

## 이번 트랙에서 의도적으로 수정하지 않는 부분

실제 Worker/Vercel/Cloud Run 배포 및 시크릿, Production DB/마이그레이션, Reader/결제 권한, 개인정보 삭제 런타임, DR 생성기/검증기를 변경하지 않습니다. 분류와 문서의 최신성 표시는 제품 활성화나 보안 완화가 아닙니다.
