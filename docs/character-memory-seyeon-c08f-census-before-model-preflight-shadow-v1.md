# C08-F — AI 3회 후보: 첫 번째 모델 호출 전에 전체 대화 이력 확인

Watchtower-Track: character-memory

## 문제

[C08-D](character-memory-seyeon-c08d-full-thread-census-shadow-v1.md)는 Fast Dialogue 후보/의미검증 전에 전체 Thread Census를 확인하지만, [C08-B](character-memory-seyeon-c08b-five-three-real-guards-offline-v1.md)처럼 `unified_preflight_shadow`부터 직접 호출하면 **첫 AI 분류 1회가 Census보다 앞서 실행**됩니다.

## 이번 변경

- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`: 기존 `requireAuthoritativeFirstTurnCensusShadowV1`를 동일 구현의 재사용 가능한 서버 함수로 노출. Fast Dialogue 내부의 2차 검사를 제거하지 않습니다.
- `apps/api/src/seyeon-census-first-three-call-shadow-v1.ts`: 오직 테스트/비연결 Shadow에서, `최근 user 메시지 단 1건/원문·Ref 일치/기억 0건/관계 null/공개 접근` 확인 → **1차 전체 Thread Census** → 기존 통합 Integrity+Disclosure 분류 모델 1회 → 서버 Preflight·Context Guard → **Fast Dialogue 내부 2차 Census** → 결합 interpret/render 모델 1회 → 독립 Semantic Review 모델 1회의 순서로 실행합니다.
- `test/seyeon-c08f-census-before-all-models-offline-v1.test.ts`: Census 부재/오류/오래된 기록은 **Provider 0회**, Preflight 직후 신규 메시지 도착(모의) 시 **Unified 1회만** 실행되고 2·3번째 호출 차단, 유효한 경우 **정확히 3회** 및 기존 Guard/검토 반환, 관리자 사칭·비정상 출력 차단을 검증합니다.

## 한계

- **실제 DB 호출이나 AI 비용은 없습니다.** Mock Census + Fake Providers뿐입니다. 3회 비용·속도·캐릭터 품질 동등성을 증명하지 않습니다.
- 1차/2차 조회 사이에는 새 메시지, Grant 철회, 다른 사용자의 동작이 발생할 수 있습니다. 두 번 읽는 것은 **경쟁 조건의 일부를 관측할 뿐, 트랜잭션 선형화/원자 커밋 증명이 아닙니다.** 두 번째 검사 이후에도 경쟁 창이 존재합니다.
- 본 오케스트레이터는 `Production Chat`에서 import/호출하지 않습니다. Reader/Subject DB ACL, 실제 PG17 두 세션, G0~G6, 개인기록 Grant Pin·Commit·Reveal은 여전히 HOLD입니다.
- 기존 DB 읽기 후보 C08-E가 있더라도 Production에서는 어떤 AI 3회 경로도 활성화하지 않습니다. 사용자의 로컬 Docker는 별도 수락 기준으로 설정할 수 있지만 현재 PR에서 운영 DB 연결/권한 변경은 하지 않습니다.

## 무료 수락 기준

`npx vitest run test/seyeon-c08f-census-before-all-models-offline-v1.test.ts test/seyeon-c08d-full-thread-census-offline-v1.test.ts test/seyeon-c08e-postgres-census-shadow-offline-v1.test.ts`

추가 유료 AI 호출 **0회**. 이전 누적 11회, 사용량 추정 3,770 microUSD, 보수적 예약 36,047 microUSD 변경 없음.

최신 헤드 CI/Governance/Web/Full Integration 통과 이후에만 병합하며, 다음 검증은 사용자가 관리하는 로컬 Docker PG17의 실제 RLS/동시성, 그리고 조회와 실행 경계 고정입니다.
