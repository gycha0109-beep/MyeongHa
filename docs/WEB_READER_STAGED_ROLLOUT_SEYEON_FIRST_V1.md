# MyeongHa Reader 단계적 개방: 공통 런타임 · 세연 우선

Status: **Seyeon Preview presentation candidate only. Paid Reader interpretation is NOT publicly activated.**

## 사용자 결정
- 캐릭터 9명의 상세 컨셉이 미확정이므로 캐릭터 서사/톤/페르소나를 임의 확정하지 않는다.
- 공식 사주 계산과 해석·상품·결제는 Reader 캐릭터의 정체성과 분리한다.
- Reader 해석은 추후 9명으로 확장 가능한 공통 Runtime과 데이터 계약을 사용한다.
- **초기 프리뷰 장면 후보는 세연 1명.** 나머지 8명은 컨셉/QA/개방 승인이 이루어지면 추가한다.
- **채팅 가능한 세연**과 **사주 Reader 유료 해석이 가능한 세연**은 별도 권한이다.

## 1. 현재 구현 (본 PR)
- `apps/web/reader-rollout-policy.js`: Preview presentation allowlist (세연) 및 나머지 8명 `concept_pending`. 모든 Reader `publicInterpretationEnabled=false`.
- `apps/web/reading-reader-picker.js`: 9명 카탈로그는 유지하고 준비 중인 8명은 선택 불가/준비 안내. 기존 픽커에서 일반 Preview 장면 선택에 한해 세연으로 진행.
- `apps/web/reading-character.js`: 직접 `?reader=` 또는 `?character=` URL을 주더라도 Preview scene display는 허용한 캐릭터로만 표시. 이 값은 서버 Reader identity가 아님.
- Preview의 사주 근거/결과 문장은 Reader 선택과 독립. Reader 능력/해석 제공에 관한 클라이언트 권한 상승 없음.
- `apps/web/reader-runtime-client.js` 및 `packages/api-client/src/reader-interpretation.ts`는 계속 범용이고 기본 차단. 다른 8명을 코드 구조에서 삭제하지 않는다.

## 2. 실제 사주 상품/Reader 런타임 경로 (후속 Owner Gate)
1. Saju owner는 현재 주체의 Birth revision, 해석 근거와 Product Reading 결괏값을 검증.
2. Commerce owner는 canonical Product, Quote, Purchase Intent, payment/provider verify, Entitlement 및 idempotent fulfillment 계약을 검증. Client에는 결제 성공만으로 Reader 권한이 생기지 않음.
3. Official Reading은 `readingId`와 `readingSessionId` 및 source provenance에 묶고 Reader와 독립적으로 영속화.
4. Character owner는 검토 완료된 Reader character ID에 대한 출시 허용 목록, 모델 컨텍스트/보호 규칙/QA와 서버 권한을 승인. 초기 공개 후보는 `seyeon`.
5. 서버는 subject-owned single-character Thread와 Official Reading을 교차 검증. Client hint나 묘사/이미지로 Reader 신원을 인증하지 않는다.
6. 서버 `ReaderInterpretationPreview`는 승인된 공개 Endpoint, hosted canary, 정책·코호트 게이트를 통과한 경우에만 노출. 현재 Production `off` 또는 제한된 `internal_preview`와 PUBLIC ROUTE 부재로 **HOLD**.
7. 서버 응답 `readerCharacterId`, domain, Official Reading ID, hash, utterance segment를 엄격 검증하고 `protected_fallback`에서는 생성되지 않은 해석을 보여주지 않는다.
8. 저장된 풀이 재진입은 subject-authorized Reading Archive에 먼저 접근하고, 사용 가능한 Reader grant가 확인되는 경우에만 해당 해석을 별도로 열람한다. Records의 Reader 배열은 provenance 표시이지 Reader 선택/Thread ID 부여가 아니다.

## 3. 후속 Reader 개방 체크리스트 (캐릭터별 독립)
- Character bible(컨셉·말투·관계·금지/보호 규칙) 리뷰 완료
- Character runtime 본문/상태 지속성, 모델 안전성, QA/Shadow 실험 PASS
- Reader Saju source invariance(캐릭터 말투가 사주 계산 의미를 바꾸지 않음)
- Reader eligibility, DB grant/Thread binding, purchase-entitlement link 승인
- Web/Mobile 공통 capability snapshot과 API 소비·실기기/브라우저 smoke
- Server public route, rollout policy, production canary, 운영 모니터링 승인

마지막 단계가 승인되기 전에는 프리뷰 장면/일반 채팅 여부와 관계없이 **유료 사주 Reader 실제 해석을 열지 않는다**.
