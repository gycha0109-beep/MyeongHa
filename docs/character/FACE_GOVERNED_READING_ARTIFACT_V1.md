# FACE_GOVERNED_READING_ARTIFACT_V1

## 목적

제품 사용이 승인된 관상 해석 결과가 세연의 읽기 계획과 최종 보호 출력을 통과한 뒤, 사용자 공개 전에 불변 결과물로 고정되고 원자적 저장 영수증과 정확히 결속되는 경계를 정의한다.

## 책임 경계

이 경로는 관상 의미를 생성하지 않는다.

상위 관상 엔진이 승인한 전달 계약의 주제, 방향, 조건, 충돌 상태, 관측 근거 참조, 관상 연결 근거 참조, 전통 해석 근거 참조, 원문 출처 참조와 보호 의미 본문을 그대로 보존한다.

캐릭터 런타임은 이미 허용된 항목의 개수와 순서, 캐릭터 반응, 후속 질문만 담당한다.

## 실행 흐름

제품 승인 관상 전달 계약
→ 세연 읽기 계획
→ 최종 보호 출력
→ 승인 관상 전용 불변 결과물
→ 원자적 저장
→ 저장 영수증 검증
→ 통제 공개

저장 전 결과물 상태는 semantic_validated / requires_atomic_commit / forbidden_before_commit 이다.

저장 성공 직후에는 committed_not_revealed / forbidden_pending_controlled_reveal 상태이며, 영수증이 결과물 해시와 정확히 결속된 것이 확인된 뒤에만 controlled_reveal_after_atomic_commit 으로 공개한다.

## 멱등성과 교체 금지

같은 turnId와 같은 결과물의 재실행은 기존 저장 영수증을 재사용한다.

같은 turnId에 다른 결과물을 저장하려는 시도는 거부한다.

이미 저장된 결과물은 이후 캐릭터 콘텐츠 버전이 바뀌었다는 이유로 다시 생성하거나 교체하지 않는다.

## 별도 결과물 구조를 사용하는 이유

기존 중립 관상 결과물은 CharacterFaceFinalOutputEnvelopeV1과 중립 관측 bundleHash에 강하게 결속되어 있다.

제품 승인 관상 해석은 sourceAuthorityRef, authorizationReceiptRef, handoffHash, selectedInterpretationIds, protectedInterpretations 같은 별도 권한 자료를 보존해야 한다.

두 경로의 권한을 섞지 않기 위해 기존 중립 결과물을 변경하지 않고 승인 관상 전용 결과물을 병행한다.

## 시험 자료 주의

현재 전체 흐름 시험의 관상 의미 자료는 실제 상위 관상 엔진이 제품용으로 발행한 운영 결과가 아니다.

시험은 제품 승인 전달 계약 형식을 만족하는 합성 고정 자료를 사용한다.

따라서 시험이 증명하는 것은 다음뿐이다.

- 제품 승인 계약 형식의 수용
- 실제 세연 Runtime Authority와 실제 세연 Face 프로필 사용
- 승인 결과와 현재 Face 분석 결과의 결속
- 선택 순서와 최대 노출 개수 보존
- 보호 의미 본문과 조건, 충돌, 근거 참조의 불변 보존
- 원자적 저장과 재시도 멱등성
- 저장 전 공개 금지와 저장 후 통제 공개

합성 fixture의 관상 의미 자체를 실제 제품 규칙으로 승인하거나 운영 데이터로 승격하지 않는다.


## Durable persistence implementation

The original contract remains unchanged, but Production persistence is now specified separately in `FACE_GOVERNED_READING_ARTIFACT_PERSISTENCE_V1.md`.

The in-memory commit port remains a contract-test boundary. It must not be described as durable DB storage. Production reveal must use the async durable commit boundary and a PostgreSQL receipt that additionally pins `finalOutputHash`.
