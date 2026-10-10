# Reader Runtime V2 — TRACK CLOSED 실행 정본 (RR-01~RR-15)

- 상태: **CONTINUE / PUBLIC OFF**. 독립 Reader 공식 사주 후속 Chat은 운영 공개 불가.
- 트랙: `reader-runtime` — 공식 Reading × 구매 검증 Grant × 고정 Thread × Reader × 원본 Saju Grounding 기반 Chat.
- 기준: 2026-10-10, 기존 병합 경계 PR #1849 / #1853 / #1860. 진행 시 항상 latest main / CI / 운영 상태를 다시 확인한다.
- 추적 규칙: 각 실행 PR 본문에는 `Watchtower-Track: reader-runtime` 정확히 한 번. 모든 작업은 구현 → 권한·위조 부정 검증 → basic CI → integration CI → 병합 → postmerge main CI와 해당 Production SHA 확인. 녹색 CI는 공개 Chat 승인 아님.

## 0. 실제 발견된 경계와 설계 결정

1. 기존 `apps/api/src/reader-interpretation-preview-runtime-v2.ts`는 Saju-owned Grounding으로 생성·Semantic Guard 통과한 Reader 해설을 **Preview** 형태로 반환한다. 내부 세그먼트에는 `sourceUnitRefs`가 있다. 그러나 `reader-interpretation-preview-http.ts`는 UI에 `kind/text`만 노출하여 provenance를 전달하지 않는다.
2. `apps/web/reading-character.js`의 일반 사주 미리보기 종료 CTA는 독립 `chat-hub.html`로 향한다. 화면의 Reader 표시 힌트는 권한이 아니며, 공식 Reader Chat으로 무조건 연결해서는 안 된다.
3. **RR-01 결정:** 서버가 공식 Scene 내용과 hash, segment index를 **현재 권한으로 다시 산출·검증**하여 선택된 Segment의 Source Unit closure만 내부 Handoff 후보로 발급한다. 브라우저가 보내는 index/hash/Reader ID/텍스트는 선택 힌트일 뿐이고 진실의 출처가 아니다. 원본 drift 시 HOLD. 공개 UI/HTTP 계약은 별도 RR-11/12 전까지 변경하지 않는다.
4. 최초 질문(A3-κ)은 구매된 원본 Root 전체가 모호할 때 HOLD한다. 명확한 Scene 특정 부분은 **검증된 Scene Segment**로만 초점 지정할 수 있고, 모델/URL이 Unit ref를 직접 선택할 수 없다. 기존 committed Answer 기반 후속(A3-η/ι)과 절대 섞지 않는다.
5. `public.qry_official_reader_followup_anchor_runtime_v1`와 검증된 Answer provenance **DB writer는 아직 구현되지 않았다**. `chat_turn_attempts.grounding_refs_jsonb`의 AI UUID를 Saju Unit로 재해석 금지.
6. 이미 존재하는 `character-saju-bounded-renderer`, `character-saju-semantic-guard`, `character-output-guard`, `reader-interpretation-preview-runtime-v2`를 재사용한다. 단, Preview guard를 최종 Chat Commit 권한으로 격상하지 않는다.
7. 세연 Production Chat V1, Saju 원본 해석, DB 권한 테이블, Commerce 결제/Grant, Content Release의 각 소유권을 보존한다. 공개 기능 toggle 기본 OFF.

## 1. 종료 작업 의존관계 및 PR 분할

| 작업 | 트랙 | 최소 산출/인수 조건 | 의존 |
| --- | --- | --- | --- |
| RR-01 | Reader | Scene → 최초 Chat 서버 재검증 Handoff: source refs, interpretationHash, segment, scope, stale/위조/권한 Fail-closed. 공개 OFF | A3-κ, A3-ζ |
| RR-02 | Reader + Saju | 실제 9도메인 근거 Unit/ID/Hash/Companion/복수 Root drift 감사; 지원/미지원 명시 및 명확화 | RR-01 |
| RR-03 | DB Authority | semantic + output guard 통과 assistant에 대한 서버발행 불변 Saju Unit provenance 원자 Writer, RLS/EXECUTE/owner | 검증된 Chat commit 계약 |
| RR-04 | DB Authority | `qry_official_reader_followup_anchor_runtime_v1` 구현 및 실제 PostgreSQL/권한 철회/교차 Tenant negative | RR-03 |
| RR-05 | Reader | Question scope: 원본 설명/직전 포커스/명확화/추가 사주/다중의도, 새 계산 불허; 임의 분류는 권한 아님 | RR-01,02 |
| RR-06 | Reader/Character | 검증한 Evidence → bounded exact-core/Character Perspective → Semantic Guard 재사용 (protected fallback) | RR-05 |
| RR-07 | Character + AI Policy | P0-AI-01 결정 후 제한적 SP-2 표현 및 구조화 출력/평가/guard, 비용·타임아웃·fallback | RR-06, 정책 |
| RR-08 | Reader | 멀티턴 일관성, Memory·Relationship 권한 분리, Guarded Anchor 외 사주 사실 오염 차단 | RR-04,07 |
| RR-09 | DB + Reader | 최종 Grant/Product/Release/Source 재조회 → 검증된 메시지+근거 원자 Commit, invalid reveal 0 | RR-03,04,06~08 |
| RR-10 | Reader/DB | 중복 클릭/Retry/동시성/Timeout/Idempotency/Revocation race 복구 | RR-09 |
| RR-11 | Backend | 독립 Reader Chat HTTP read/send/receive 안전 실행, 인증, rate-limit, 구형 클라이언트 호환. V1 불변 | RR-09,10 |
| RR-12 | Web/Product | 공식 Reading Scene → 동일 Reader Thread → 대화 및 Records 재조회. Preview CTA는 증명 전 활성화 금지 | RR-01,11 |
| RR-13 | QA/Commerce/Saju | 승인 가능한 Reader×Domain 9×9 지원 matrix, cross-subject/Reader/Reading/Refund, 추가 Reader 결제, 실제 DB·Saju E2E | RR-09~12, 상품 |
| RR-14 | Ops/Release | 기능 OFF → 내부 제한 → 점진 배포; 측정, guard fallback, 비활성화, rollback, exact-SHA 확인 | RR-13, 출시 정책 |
| RR-15 | Reader+총괄 | 전체 이력/테스트/운영 Runbook/소유권 인계, 미해결 P0=0, TRACK CLOSED 검증 | RR-14 |

병렬 최적화: RR-01/02 이후 RR-03/04(DB Owner)와 RR-05/06(Reader)를 병렬 진행. RR-07의 P0 AI 정책은 Owner 결정 이전 모델 강제 도입 금지. RR-11/12 이전에 Preview UI를 공인 Chat으로 오인시키지 않는다.

## 2. 프로젝트 차단 선행 조건

- `P0-AI-01`: 생성형 공급자/모델/실패 정책 OPEN. 정책 없는 유료 AI 호출 또는 SP-2 상용화 금지.
- `P0-CM-03`: 상품/Charge Terms 활성화 OPEN. 실제 신규 유료 구매 E2E 검증 대기.
- `P0-AGE-01`: 연령/캐릭터 콘텐츠 정책 OPEN. 공개 안전 검수에 의존.
- `SRC-15`: MVP evaluator 계약 해결이나 실제 자산 호환성 검사 필요.
- `SRC-16`: MVP 회원 기본 Release 결정 완료; Guest/실험 Cohort 롤아웃을 임의 확대하지 않는다.
- DB Owner의 전용 근거 provenance Writer/Query 구현 및 권한 검증이 최종 Critical Path.

## 3. 합격 지표와 최종 종료 조건

- **출처:** 공식 의미 문장 `sourceUnitRefs` 추적 100%, 필수 companion/qualifier/disclosure/ambiguity 누락 0.
- **권한:** 잘못된 사용자/Reader/Reading/Thread/ContentRelease/Product/Grant 접근 승인 0, Refund/Revocation 후 신규 reveal 0.
- **정합성:** 동일 요청 단일 Commit, 재전송 안전, 검증 전 reveal 0, 같은 Reader의 이전 답변 재사용 시 정확한 검증 Anchor만 참조.
- **캐릭터:** 실제 채택 Reader 간 어조·관점 차이 검증, 명리 의미 drift 0; 강제 fallback은 내부 기록과 사용자 메시지에서 구분.
- **배포:** 실제 API → PostgreSQL → 공식 Saju → Reader Chat → Records 경로를 완성하고, Production exact commit SHA·관측·OFF switch·Rollback 확인.
- **TRACK CLOSED:** RR-01~15 모두 merged-main 검증 PASS, 정책/실제 서비스 Blocker 0, Runbook/인수인계 및 운영 책임 소유자 지정. CI/Vercel READY만으로 종료 불가.
- **STOP/HOLD:** Unsupported Domain/Unapproved Product/DB Query missing/AI Owner undecided/정책 미승인/권한 격리 결함 → 공개 OFF 유지.

진행 보고는 간단히 `완료 / 문제 / 다음 작업`만 기록한다. 매 PR은 세연 운영 V1·기존 Revenue/DB/Content 도메인 무변경 확인을 포함한다.
