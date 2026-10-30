# 세연 C09 — 캐릭터 지식 경계·학습 판정 Shadow 구현 (2026-10-29)

**상태: 구현 + 단위 테스트 / 운영 미연결.** 신규 DB migration, 승인 없는 기억 저장·수정, Production 모델 라우팅 및 유료 실험 없음.

## 근거와 불변 원칙

- 출처: docs/character-memory-seyeon-c09-epistemic-knowledge-boundary-research-20261029.md
- **모델이 가진 일반지식 ≠ 캐릭터가 배운 지식 ≠ 정보 공개 권한 ≠ 실제 응답 행동.**
- 명시적으로 제한된 전문 능력과 일상 상식을 구분한다. 지식 기록이 없다는 것만으로 모른다고 판정하지 않는다.
- 테스트의 세연이 Python을 모른다는 조건은 **연구 T0 시나리오의 합성 Canon fixture**이다. 운영 Bible의 확정된 Python 실력이 아니다.

## 구현 위치

- packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.ts
  - 주제별 서버 소유 정책: ambient / bounded / authority_only.
  - 초기 수준: not_recorded / explicit_unaware / heard_of / basic / practiced / proficient.
  - 검증 증빙: characterId/topicKey, 원본 authorityRef, sourceKind, learnedAt/validAt/supersededAt, visibility, subjectId, 공유 승인, 개인정보 검토.
  - A의 user_private 학습은 B에게 이전하지 않으며, character_shared 검증/동의/개인정보 검토가 모두 있어야 공유 가능.
  - 학습 시점·철회·중복/위조 자료를 배제하고 반환은 evidence ID/knowledge level/권한으로 제한. 사용자 발언/LLM 이전 답변은 검증된 학습 근거가 아님.
  - 응답 권한 normal / partial / learn / withhold. bounded 전문기술 실행은 practiced 미만에서 withhold.
- apps/api/src/seyeon-c09-continuity-shadow-v1.ts
  - 선택적 서버 소유 epistemicAuthorityPort 연결. Subject ID와 Topic/Level/Policy/Provenance 메타데이터를 확인.
  - learn/withhold/미승인 기술 실행은 후보 LLM 호출 전에 reject (C09_KNOWLEDGE_RESTRICTED).
  - partial/normal은 기존 구조화 Character State → Decision → Renderer 요청에 지식 메타데이터를 전달. 원문·교사 개인정보는 전달하지 않음.
  - 후보 생성 전·후·독립 의미 검토 후 지식 판정 세 번 재조회. 검증 상태나 정책이 바뀌면 후보 폐기.
  - 기존 관계/기억/Character Guard는 유지. 해당 포트 없는 기존 실험 Shadow 동작 변경 없음.

## 검증 범위

- 독립 지식 판정 12개 테스트: 명시적 미인지, 기본 상식, 배움의 수준, A/B 교차, 공유 승인·개인정보 검토, 학습 시점과 철회, 작성자 전용 자료.
- 연속성 Shadow 5개 지식 경계 테스트: 미인지 기술 실행 선차단, 허용된 지식 partial 전달, 도중 철회 차단, Subject 불일치, 위조된 지식 권한 차단.
- C09 기존 테스트 포함 총 **41개 로컬 PASS**, 빌드용 TypeScript 검사 PASS. DB Mock와 Fake Provider 기반이며 GLM/Luna 품질 실측은 아님.

## 미완료·중요한 경계

1. **실제 DB Knowledge Authority adapter 없음**: Character Canon의 명시적 미인지 정책/검증된 학습 이벤트/Revocation을 독립 조회해야 한다. 현재는 합성 fixtures와 Port 계약만 존재.
2. **실제 학습·공유 승인 커밋 없음**: 사용자 발언을 바로 character_shared로 승격하지 않음.
3. **자연스러운 '모른다/배우겠다' 발화 구현 없음**: learn/withhold는 현재 Shadow에서 provider를 막고 에러를 반환한다. 캐릭터 자연어 응답은 후속 구현 범위.
4. **부분 지식의 전문 주장 검사는 완전하지 않음**: partial 경로는 기존 Guard/Reviewer에 의존하며 모델의 모든 parametric knowledge 누출을 기계적으로 증명하지 못함. 전문 영역 자유 서술의 100% 보장 금지.
5. 기존 C09 Postgres multi-turn Census의 conversation_messages direct SELECT ACL 블로커는 여전히 별도 미해결. 본 작업에서 ACL/권한을 변경하지 않음.

## 다음 순서

Character Canon의 지식 제한 조회 및 검증 가능한 학습 Ledger 연결 → 안전한 learn/withhold 인격 표현 → 가변 전문성 상태/학습 이력 read-only projection → 사용자 간·세션 간 Gold 평가 → 실모델 비교 및 운영 통합 검토.
