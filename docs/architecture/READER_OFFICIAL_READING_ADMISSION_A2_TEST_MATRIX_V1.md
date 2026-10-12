# A2 — Reader 서버 권한 테스트·단계별 구현 계획 v1

> 설계 검증 문서. 아직 실행된 테스트 결과나 운영 승인이 아님.
> 부모 문서: READER_OFFICIAL_READING_ADMISSION_A2_DESIGN_V1.md.
> DB/Commerce owner 승인 전까지 policy 미등록과 실제 유료 Reader 공개는 HOLD.

## 1. 필수 인증 테스트 매트릭스

| 케이스 | 예상 | Access / policy / artifact / Saju 호출 |
| --- | --- | --- |
| Subject 미인증 | DENY | 0 / 0 / 0 / 0 |
| Reader Preview OFF / 코호트 밖 | HOLD | 0 / 0 / 0 / 0 |
| 다른 사용자 Thread | DENY | 0 또는 1 / 0 / 0 / 0 |
| Group Thread / 다른 Reader Thread | DENY | 0 / 0 / 0 / 0 |
| 정확한 Reader Grant 없음 | DENY | 1 / 0 / 0 / 0 |
| Reader A만 구매, Reader B로 요청 | DENY | 1 / 0 / 0 / 0 |
| revoke/expired/refund Reader Grant | DENY | 1 / 0 / 0 / 0 |
| metadata 중복행 / 다른 Subject/Reader | DENY | 1 / 0 / 0 / 0 |
| metadata Reader contentBundle 불일치 | DENY | 1 / 0 / 0 / 0 |
| Product policy unclassified/disabled/stale | HOLD | 1 / 1 / 0 / 0 |
| Product rule timeout/throw/malformed | HOLD | 1 / 1 / 0 / 0 |
| 정상 general standard Product, 9명 Reader | PRODUCT_ELIGIBLE, 각각 exact Grant 필요 | Reader별 독립 Grant 테스트 |
| future premium 허용 Reader | Product PASS, Grant 분리 | synthetic fixture 한정 |
| future premium 불허 Reader | DENY | 1 / 1 / 0 / 0 |
| 상품명 standard.* 이지만 미승인 | HOLD | 1 / 1 / 0 / 0 |
| metadata Product ID/spec/domain과 rule 불일치 | HOLD | 1 / 1 / 0 / 0 |
| artifact Reader/Product/Hash/contract mismatch | DENY | 1 / 1 / 1 / 0 |
| artifact pending/failed/invalid response | DENY | 1 / 1 / 1 / 0 |
| 위조된 Ticket/다른 요청 Ticket/재사용 Ticket | DENY | 소비 불가 |
| A2 성공 + A3 미연결 | HOLD | 공개 Scene 생성 불가 |
| authorized Reader + Grounding/semantic failure | guarded fallback / bounded failure | 권한 PASS 이후만 |

호출 횟수는 테스트 mock 목표. 실제 Reader A/B의 독립성 및 source parity는 기존 DB 권한 계약과 연결하여 검증한다.

## 2. 구현 단계와 책임

### A2-α — Source 분리 (API/DB 조회 seam)

수정 후보:
- apps/api/src/character-standard-reading-knowledge.ts
- apps/api/src/postgres-character-standard-reading-knowledge.ts (기존 SQL 포트 재사용 시 변경 최소)
- test/character-standard-reading-knowledge.test.ts
- test/postgres-character-standard-reading-knowledge.test.ts

목표:
- readExactAccessibleReadingMetadata()를 분리해 metadata만으로 Subject, Reader, Reading, Bundle, Product keys를 검증.
- readExactOfficialArtifactAfterApproval()는 별도 단계에서 정확한 일치/해시 검증.
- 기존 resolveCharacterStandardReadingKnowledgeV1는 새 두 함수를 호출하는 compatibility wrapper로 유지.
- 기존 SQL DB 함수, RLS/role 권한, 원본 구조 및 API response는 변경하지 않음.

### A2-β — Server-only Product 승인 및 Ticket

수정/신규 후보:
- apps/api/src/official-reading-reader-admission-v1.ts (새)
- apps/api/src/product-reader-eligibility-policy-v1.ts (A1 그대로, 불가피한 연계만)
- test/official-reading-reader-admission-v1.test.ts (새)

목표:
- server-owned Product rule port 결속, metadata-first 순서 강제.
- exact Thread/content/Reader/Grant/Artifact parity 뒤 opaque server proof.
- 모든 deny에서 원문/모델/Saju 0회. 정책 없는 Production 기본 HOLD.
- A1의 plain eligible result를 권한 증명으로 받지 않음.

### A2-γ — Preview/Chat 배선 (앱화 + Character 검토)

수정 후보:
- apps/api/src/character-standard-reading-server-runtime-authority.ts
- apps/api/src/character-standard-reading-chat-turn-context.ts
- apps/api/src/reader-interpretation-preview-runtime-v1.ts
- apps/api/src/reader-interpretation-preview-http.ts (HTTP schema 변경 금지)
- apps/api/src/reader-interpretation-preview-postgres-execution.ts
- test/reader-interpretation-preview-runtime-v1.test.ts
- test/reader-interpretation-preview-postgres-execution.test.ts
- test/character-standard-reading-chat-turn-context.test.ts

목표:
- 실제 Reader execution 이전에 A2 proof 소비.
- 서버 본문 요청은 그대로 threadId + officialReadingId.
- Product/Commerce 승인 정책 백킹이 없으면 raw artifact/Saju 호출 전 HOLD.
- Character domain capability hardgate는 A3에서 통일해 변경하므로 A2만으로 실제 Reader 해설 공개 판정 금지.
- 기존 세연 내부 Preview 단일코호트/public OFF 유지.

### A3 이후

Character Runtime v2로 Character.capabilities 사주 domain gate 교체, selector 출처/도메인 보호 유지.
Web/Mobile, 최종 구매/재열람/후속 Chat/환불은 운영 정책 별도 승인 후 A4.

## 3. 성능 및 보안 회귀

- 원격 정책 조회 timeout/DB rollback/pool release 실패에서 후속 단계 실행 금지.
- Product resolver가 고객별 Grant 증명 없이 임의 허용을 반환해도 이후 exact Grant 필요.
- 내부 Ticket scope의 Subject, Reader, Reading, release, Product, version, policyRevision, hash를 1개씩 변조하여 거부 검사.
- concurrent revoke before read / after access / during Saju HTTP / just before response를 별도 DB 통합 테스트. race policy 결정 전에는 해결 완료라고 주장하지 않음.
- 같은 Official Reading 다른 Reader 권한 부여 시 Official artifact count/response hash 그대로. 추가 Reader는 정확한 새 Interpretation/Grant 연결.
- Source response snapshot과 Birth PII가 HTTP / logs / Saju request에 누출되지 않음.
- legacy 일반 Chat, Character voice/perspective, semantic/output Guard, Authoritative Grounding 회귀.
- Product policy 없을 때 OFF/미승인 상태가 변하지 않는 안전 테스트.

## 4. CI 및 트랙 충돌 회피

작은 PR 3개로 책임을 분리한다. α: Reader Knowledge 소유 API, β: App/Commerce 상품권한, γ: App Reader composition + Character 연계.
α/β/γ 변경 시 각각 affected tests + TypeScript + Governance + security PASS → ci-integration-ready 라벨 단 1회 → Full Integration 전체 DB/Payment/Entitlement/Runtime/Main Regression PASS → squash merge.
매번 HEAD/base 최신 SHA 확인 후 병합하고, Vercel Production SHA/READY가 병합 SHA와 일치하는지 검증한다.
다른 트랙의 DB/Commerce 권한 소유 파일을 앱화 트랙이 임의 수정하지 않는다.

## 5. 종료 조건

**A — 설계:** 호출 순서·모듈 경계·타입·정확한 DB SourceTruth·미승인 정책 HOLD·Ticket 안전성·테스트 계획 제시.

**B — A2 구현:** α/β/γ 병합 및 기본·통합 CI PASS; Product/Commerce 승인된 운영 정책 source가 없는 경우 어떤 활성화도 없다.

**C — 사용자 공개:** A3 Character domain gate migration, 실제 approved Product/Offer/Grant, Reader 저작 품질, hosted Saju, Web/Mobile 후속 Chat·기록·재열람 E2E, revoke 검증 및 운영승인까지 필요.

현재 A는 설계 검토 단계. B/C는 미달성. 설계 PR 병합만으로 B/C PASS 판정 금지.
