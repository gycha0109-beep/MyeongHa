# A3-κ Official Reader 첫 질문 — Saju 원본 근거 진입

**상태:** 내부 제한 후보 진입만 구현. 공개 Chat OFF. 답변 생성·DB Commit 없음.

## 질문의 두 출처 (혼합 금지)

- **최초 공식 질문:** 기존 검증 Assistant Answer가 DB에 없음을 DB 소유 조회 계약으로 확인한 뒤, 구매·권한이 검증된 공식 Reading의 Saju 소유 Grounding에서 근거를 선택
- **후속 질문:** 이미 Commit·Semantic Guard를 통과한 Assistant Answer Anchor로 진입 (A3-η/ι). 최초 질문으로 강등하지 않음

**공통 선행 조건:** 서버 발급 Chat Receive → A2 공식 Reader/Grant/Product 검증 → A3 one-use 증명 → 현재 원본 재조회 및 Saju Grounding 검증. UI·브라우저가 Unit ID 또는 Reader 범위를 공급해 권한이 될 수 없음.

## A3-κ 최초 진입 규칙

1. 질문 문장이 `방금 본 [정확한 기존 도메인] 해석을 (조금) 더 (쉽게) 설명해 주세요` 계열의 명시적 질문이어야 합니다. '그 부분' 등 **이전 Assistant Answer를 전제로 하는 표현**은 최초 질문으로 인정하지 않습니다.
2. 기존 검증 Anchor 조회 1회: 정확한 Subject×Thread×Reader×Reading 소유 함수의 `null`만 최초 질문 후보를 허용합니다. 기존 Anchor가 있으면 기존 후속 경로로 전환해야 하며, **DB 오류나 조회 함수 부재는 ACCESS_DENIED**입니다.
3. Saju 소유 Grounding 내 독립적 `primary` 원인 Unit이 정확히 하나, 모든 다른 Unit이 그 Root의 `requiredCompanionUnitRefs` 전이 폐쇄에 포함되고 총 Unit이 1–12개일 때만 후보를 생성합니다. 임의의 Primary 우선순위·전체 Unit 단순 복사·브라우저 선택은 금지합니다.
4. 필수 Companion, Disclosure, Ambiguity를 유지하고 하나라도 보호 정책·qualifier·ambiguity가 존재하면 `protected_only_candidate`입니다. 보존 확인이 실패하면 차단합니다.
5. 질문·원본·근거·주체·Reader·Reading 참조를 결정적 해시에 묶고 메모리 내부 WeakSet 발급으로 구조적 위조를 거부합니다.
6. 불명확한 Reading, 다수 Root, 소스 근거 없음, 기간 변경, 새로운 해석은 HOLD. **AI 답변 생성·전송·저장 허가가 아닙니다.**

## 테스트 및 범위

- 1개 원본 Root의 명시적 첫 질문 후보
- 복수 독립 근거의 명확화 요구
- Root + Companion + 필수 Disclosure/Ambiguity의 보존
- 기존 검증 답변이 있을 때 최초 경로 금지
- DB 부재/권한 오류 시 Fail-closed
- 타 도메인·신규 계산·숨은 문자·프롬프트 삽입 및 구조적 위조 차단

## 후속 계약과 중단 조건

- 현재 실제 DB `qry_official_reader_followup_anchor_runtime_v1` 및 **검증된 Anchor 원자적 Writer는 미구현**: 운영 실제 호출 HOLD. 코드에서 가짜 Anchor를 생성하여 우회할 수 없음
- DB Owner는 기존 #1849의 저장·조회 계약과 최초/후속 전환 적합성을 검증해야 함
- 다음 PR은 검증된 근거만을 받는 **캐릭터 bounded renderer 및 의미·출력 Guard** (DB Writer 합의와 병렬 가능)
- DB 원자 Commit, Replay, 현재 Grant/Product 최종 재검증, 9 Reader × 9 도메인 통합 E2E 전까지 공개 Chat OFF

**완료 판단:** CI·Governance·Integration PASS + 병합
**남은 HOLD:** DB Authority 이행 / 답변 생성·검증 / 원자 Commit / 공개 E2E
