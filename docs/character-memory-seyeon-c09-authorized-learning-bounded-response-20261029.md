# 세연 C09 학습 증빙 Authority 연결 + 모름·배움 표현 (2026-10-29)

**상태: 개발 Shadow 구현.** 실제 검증된 캐릭터 공통지식 DB 원장·학습 Commit·운영 채팅 라우팅·실모델 품질 비교는 미구현.

## 근거

- docs/character/CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md
- docs/character-memory-seyeon-c09-epistemic-knowledge-boundary-research-20261029.md
- docs/character-memory-seyeon-c09-epistemic-resolver-shadow-implementation-20261029.md

## 실제 구현

1. **서버 소유의 지식 Authority 조회 계약**
   - apps/api/src/seyeon-c09-epistemic-authority-shadow-v1.ts
   - 입력: 이미 검증된 canonical Subject + 실제 사용자 메시지 ID.
   - 출처: 서버가 독립적으로 분류한 주제/요청 행위, Canon에서 승인된 Topic Policy, 승인된 Learning History와 각 Evidence 원본의 별도 유효성 검증.
   - VerifiedEvidence의 sourceKind/knowledgeLevel/validAt/supersededAt/privacyReviewed/approvedForCharacterSharing/visibility를 기존 Resolver의 폐쇄형 계약으로 재판정.
   - Unknown Canon policy / 확인할 수 없는 학습 출처 / 타 Subject의 private lesson / 허위 검증 → 무조건 fail-closed.
   - 각 재조회는 동일 Subject/Turn/Topic을 사용하고 evidence 활성 상태를 다시 확인. **클라이언트 제출 증명서나 단순 RAG 결과가 학습 승인이 되는 것은 아님.**

2. **기존 PostgreSQL Shadow 팩토리와 연결**
   - apps/api/src/postgres-seyeon-c09-continuity-shadow-v1.ts
   - 기존 canonical Subject scope에서 approvedLearningAuthority가 명시적으로 제공되면 Epistemic Port를 조립한다. 기본적으로 비활성화.
   - Server-side source implementation이 반드시 독립적으로 승인 이력/철회를 확인해야 하며, 아직 실 서비스 DB 원장에 직접 연결한 것은 아님.

3. **모름·배움 제한 응답**
   - apps/api/src/seyeon-c09-bounded-knowledge-renderer-shadow-v1.ts
   - 앱이 검증한 learn/withhold 판정을 바탕으로 세연의 호기심 / 솔직한 한계 인정 / 독립적인 태도 중 하나를 선택하여 짧은 존댓말 발화로 표현한다.
   - 사용자 텍스트/기억/모델 지식/전문 코드/출처를 문장에 삽입하지 않고 서버 소유 승인 문장 중에서만 출력. 이전 대사와 중복되는 문장은 우선 피함.
   - Decision 메타데이터(현재 욕구·긴장·행동)를 기록하지만 **세연의 영구 지식/감정/관계 상태 변경 없음**.
   - apps/api/src/seyeon-c09-continuity-shadow-v1.ts에 별도 opt-in evaluateKnowledgeBoundary 추가. 기존 evaluate 및 운영 API는 유지.
   - **기존 Character-first 자유 생성과 별개인 제한 렌더러**이며 실제 LLM이 독립적으로 임의 문장을 만드는 방식이 아님. 자유 생성에 지식이 누출될 위험을 피하는 단계적 처리로, 현재 문장 선택은 제한적인 authored repertoire다.
   - 처음·중간·마지막에 기존 Full Thread/Memory/Relationship Snapshot + Epistemic Source를 각 3회 검증. 원본/학습 승인 철회/새 메시지가 바뀌면 결과 폐기.

## 실제 검증

- tsc -p tsconfig.build.json --noEmit: PASS.
- Vitest 6개 관련 파일: **51/51 PASS**.
- 합성 예제: 모르는 Python 전문 실행 제한, 학습 제안에 대한 세연의 제한 응답, 학습 출처 검증, 공유 승인/비공개 경계, 생성 중 철회, 답변 도중 새 메시지, 기존 Postgres Subject Shadow 연동.
- 모의 PostgreSQL/가짜 서버 Learning Source. 실제 Production DB를 읽거나 실제 GLM/Luna를 호출한 것이 아님.

## 실제 블로커 및 다음 작업

- 기존 supabase/migrations/0050_personal_record.sql의 memory_items·memory_proposals·record_access_grants는 **사용자별 기억/Grant**이며, 검증·privacy-reviewed를 갖춘 캐릭터 공통 학습 원장을 증명하지 않는다. 현재 해당 전용 authoritative ledger와 실 서버 Source Reader가 없으므로 다른 사용자의 개인 학습을 공통 지식으로 자동 공유하지 않는다.
- 기존 myeongha_api_executor의 conversation_messages 직접 SELECT ACL 부족으로 C09 multi-turn Census 실연결은 별도로 차단.
- Source Reader/원장의 쓰기·Revocation/Consent 모델을 실제 설계 Authority와 일치시킨 뒤 승인된 기록으로만 read adapter 구현 및 테스트. 새로운 DB 스키마·Security Definer·ACL 확대는 이번 PR에서 하지 않음.
- 결과의 HTTP Reveal/Memory Commit, 실제 캐릭터 대사의 표현 다양성 및 전문가 지식 유출 검증은 후속 진행 사항. '자연스럽다'는 품질 판정은 실제 사용자/모델 평가 전까지 유보.
