# Reader Runtime V2 — 실행·검증 누적 기록

상위 종료 정본: `docs/architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md`.
이 기록은 단계별 구현 증거와 잔여 차단을 다룹니다. 오래된 SHA를 현재 main으로 간주하지 않습니다.

## 2026-10-10 — RR-02 검증 및 RR-05 안전 범위 확장

### RR-02: 코드·PR 완료 / 공개 HOLD

- PR #1873: 병합 완료, squash merge SHA `8acdf56ce133d601819c1869924564a159f82764`.
- 전체 Integration run `38043770064`: 11개 job 모두 `completed/success`; Head `fa3764a3f46ea23eca1a12c55918ba536f9febf9`.
- 병합 SHA의 Governance/Web Smoke/Supabase Production은 성공. 병합 SHA의 기본 CI run `38043994450`은 **취소**됨; 이를 PASS로 승격하지 않음.
- 이후 조회한 main `3dc1d16aa6ec4628b9ca2052b89a187d2ab18ddf`의 exact-SHA CI/Governance/Web Browser Smoke/Supabase Production 워크플로는 모두 성공. 운영 Vercel/Supabase **배포 소스가 해당 SHA인지 별도 확인 필요**.
- 9개 Saju 도메인 구조 호환성은 완료되었으나 실제 9×9 Product/Grant/Reading 생산·판매 승인은 **RR-13 HOLD**.

### RR-03/04: DB Authority 대기

- `apps/api/src/postgres-standard-followup-anchor-v1.ts`는 읽기 전용 포트이며 `public.qry_official_reader_followup_anchor_runtime_v1` 함수 실배포 증명이 없음.
- 2026-10-10 main의 `supabase/migrations` 목록에 공식 Assistant Source Unit 원자 Writer / 전용 Anchor Query migration을 확인하지 못함. 다른 이름의 동등 구현이 있을 수 있으므로 DB 소유자 확인·실DB 부정 검증 이전에 구현 완료 선언하지 않음.
- DB #1827 계열의 Grant/환불 경합 검증은 별도 트랙 범위이며 실제 공식 Reader final Commit/Reveal 권한 증명은 아님.
- 공식 Saju Unit ID를 기존 AI UUID/Se-yeon grounding 또는 Standard Reader Interpretation 메타데이터와 혼용 금지.

### RR-05: 보수적 한국어 질문 분류 증분

- 이 브랜치는 기존 V1 서버 발급 Preflight·근거 Selector 구조를 유지하고, `character-standard-reading-chat-question-scope-v1.ts`에서 네 가지 경우를 내부적으로 구분하도록 보완함:
  - 검증된 직전 답변의 추가 설명: 제한적 allowlist
  - 애매한 지시어: 명확화 요청
  - 새 기간/도메인/타인 사주: 새로운 출처 권한 필요
  - 복합 요청: 명시적 복수 요청 HOLD
- 구조적 위조 방지 및 정확한 DB Anchor 선행조건은 그대로 유지. 분류 성공은 답변·DB Commit·Reveal 권한이 아님.
- 테스트: `test/character-standard-reading-chat-rr05-lexical-intent.test.ts` 및 기존 `character-standard-reading-chat-turn-context.test.ts` 회귀.
- **검증:** 이 기록이 작성된 시점의 PR CI/Integration 결과는 아직 미확정. 최종 검증 후 업데이트 필요.

### RR-06~15 및 운영

- RR-06: 기존 `character-saju-bounded-renderer`, `character-saju-semantic-guard`, `character-output-guard`와 공식 검증된 답변 후보를 안전하게 연결할 범위 확인 필요. Preview를 Chat Commit으로 우회 불허.
- P0-AI-01, P0-CM-03, P0-AGE-01 최신 결정은 `OPEN-P0`. RR-07 생성형/상업 공개 및 RR-13 판매 E2E는 HOLD.
- RR-09~15 원자 Commit, HTTP, UX, 운영 공개·롤백, 인수인계·종료 감사를 아직 증명하지 못함.
- 세연 Production Chat V1 무변경 / Official Reader Chat PUBLIC OFF / 전체 트랙 상태: **CONTINUE, NOT TRACK CLOSED**.

## 2026-10-10 — RR-05 병합 / RR-06 안전한 내부 렌더링 후보

### RR-05 병합 증거

- PR #1883 squash 병합 SHA `ee8a877754c994e8456db27696a7ea48e2cae7f7`.
- exact-head 기본 CI/Governance/Web PR Domain Gates 통과, 전체 Integration run `38048998306` 11개 Job 모두 SUCCESS.
- 해당 commit의 Vercel Production deployment `dpl_74wiU4LqLDVeMAVqZKhkhtEGzsF8` READY (코드가 배포됐다는 사실만 증명).
- postmerge exact-SHA main CI는 이후 push와 겹쳐 `cancelled`; 성공으로 재해석 금지. 추후 main의 별도 CI 관측이 필요함.
- RR-05의 모든 자유 질문 이해·미지원 영역 처리는 여전히 제한적. Question Scope의 확장은 승인이나 답변 생성 권한을 주지 않음.

### RR-06 최소 범위

- `character-standard-reading-chat-bounded-candidate-v1.ts`: 기존 `renderCharacterSajuBoundedExactCoreV2` + `guardCharacterSajuSemanticPreservationV2` 재사용. 별도 해석 엔진 신설 없음.
- DB에 의해 검증된 후속 Answer Anchor의 Source Unit closure와 Renderer 선정 Unit 집합이 **정확히 동일할 때만** 내부 Semantic Guard 후보 생성. 선택 Unit 범위를 확대하면 HOLD.
- 전역 Disclosure/Calculation Ambiguity 및 Qualifier 보호 여부를 RR-02 Source Closure와 대조. 보호된 내용은 독자 paraphrase를 허용하지 않음.
- 후보는 내부 전용이며 Output Guard, Writer/Commit/Reveal, HTTP/public Chat 권한이 없음. 아직 RR-06 최종 PASS나 RR-09 최종 답변 무결성을 선언하지 않음.
- 부정 테스트: 범위 초과 Unit, protected-only, 서버 Mint 증명 객체 위조, source mismatch.
- 이 코드가 포함된 PR의 기본 CI/전체 Integration, 병합 SHA, exact Production 검증 결과는 별도 확인 필요.

### 정책 및 통합 차단

- RR-03/04 DB Owner 인계 Issue #1884. Writer/Query 실DB E2E 완료 전 재사용 가능한 공식 Assistant 근거가 없음.
- Saju `docs/product/22-production-interpretation-authority-audit.md`는 실제 Product Interpretation Production Registry를 아직 BLOCKED로 기록. Saju 원본 semantic authority 승인 없는 유료 도메인 출시 금지.
- `P0-AI-01`, `P0-CM-03`, `P0-AGE-01` OPEN-P0. 본 내부 PR은 해당 정책을 대신 결정하지 않음.
- 모든 단계에서 **PUBLIC OFF / TRACK NOT CLOSED** 유지.
