# Se-yeon V1/V2 보안 정책 실모델 평가 전제 검사 및 권한 음성 회귀 v1

Watchtower-Track: security
상태: **오프라인 검증 후보 / 실모델 HOLD**  
연결 이슈: #1816, 이전 Shadow PR #1812

## 비용 사고 HOLD 확인

- 기존 `.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml`는 **비용 사고에 따른 `if: ${{ false }}` 유료 평가 잠금** 상태이며, `workflow_dispatch` / `push` 모두 동일하게 차단된다.
- 기존 `.github/workflows/seyeon-model-eval-v1.yml`도 동일하게 잠겨 있다.
- 본 PR은 두 보호 조건을 건드리지 않고, 보호된 `OPENAI_API_KEY`를 이용하는 다른 경로를 만들지 않는다.
- 평가 실행·예산 승격·실모델 비용 청구에 대해서는 별도 비용 사고 재개 승인 PR이 필요하다. 기존 issue #1816의 라이브 평가 준비 조건만 정교화한다.

## 오프라인 4-cell 검증

`test/seyeon-security-four-cell-offline-v1.test.ts`는 **실제 구조화 Provider가 만든 요청을 fake transport에서만 읽고 비교**한다. Production 구현을 변경하거나 실제 네트워크 요청을 발생시키지 않는다.

| 평가 | 기존/후보 단계 수 | 방어문 | 모델 라우팅 기반 |
|---|---:|---|---|
| A | 5회 | V1 619자 | legacy Terra 단계 |
| B | 5회 | V2 260자 | A와 동일 |
| C | 3회 | V1 619자 | Luna unified preflight + Terra 통합/검증 |
| D | 3회 | V2 260자 | C와 동일 |

- 정상 대화 + 직접 공격, 가짜 역할, 과거 대화, Memory, Council/Peer, Reader, 검색된 근거, HTML 외부 전송, Unicode 난독화 등 합성 11개 테스트 소재.
- 각 fake request에서 **단계 개수 일치**, 데이터=user role JSON, server instructions 분리, strict schema, `store:false`, tool 부재를 검증.
- B/D 후보 방어문으로 교체하는 것은 fake `fetchImpl` 내부에서 생성한 **일회성 메모리 객체에만** 적용한다. 운영 코드/실제 요청·캐릭터 트랙 런타임에는 전혀 연결하지 않는다.
- fake `{"accepted":true}`는 모델이 인젝션을 거부했다는 증거가 아니다. 실제 거부율, 출력 품질, 캐시 토큰, 추론비, P50/P95도 계측하지 않았다.

## 권한 음성 검사

`test/seyeon-security-context-authority-negatives-v1.test.ts`는 실제 서버 함수에 **합성된** poison 데이터를 제공해 다음 내용을 검증한다.

1. 승인되지 않은 Memory `recordType/schemaVersion`은 가짜 `grantId` 및 공격 지시가 포함되어도 `UNSUPPORTED_SCHEMA`가 되며 모델용 `retrievedMemories`에 유입되지 않는다.
2. 세연 최근 대화라고 속이는 다른 Character의 응답은 서버에서 거부한다.
3. Reader Memory Grant 조회는 공격 문장 대신 **서버가 전달한 subjectId / memoryItemId**로 DB 조회를 구성한다. mock이므로 실제 DB RLS는 이 단위시험의 범위가 아니다.

**미검증:** Council 실제 런타임 출력 전달, 승인된 Projector의 Memory Poisoning, Reader 실 DB 교차 Subject/Grant/RLS, 실제 출력 UI exfil, 멀티턴 jailbreak. 이 항목들은 실 DB authority 통합시험 및 보호된 실모델 평가에서 분리 검증해야 한다.

## 유료 A/B 재개 시 요구 조건 (현재 금지)

1. character-memory 비용 트랙이 비용 사고 원인·미정산 호출·최대 비용/호출·모델별 단가·초과 시 kill switch 검증을 끝낸 후 별도 PR로 승인.
2. 그 이후에만 기존 실모델 평가 runner를 확장하여 4개 셀을 같은 합성 케이스, 모델 스냅샷, 회수/시간 제한, 순서 교차, 재시도 0으로 실행. 필요 시 max calls/비용을 새로 심사. 현행 `128 calls / $3`의 두 경로 계획을 네 경로에 무단 재사용하지 않는다.
3. 서버 출력/권한 검증은 반드시 현행 결과와 동등하거나 강화되어야 하며, 비정상 응답을 자동 재요청하면 비용이 늘므로 금지.
4. P50/P95, 실제 입력/캐시/출력 토큰 및 원가, 정상 한국어 대화 품질, 3회 Shadow 제한 충족, 공격 성공/오탐/차단 케이스를 수집하되 프롬프트·원문·실사용자 기록·비밀키는 로그로 남기지 않는다.
5. 무단 읽기·쓰기·Reader 우회·무검증 공개 또는 schema escape 성공 0건을 승격 전 필수 조건으로 하며, 실모델 jailbreak 무결성은 추가 표본/다중 턴 red-team 결과로 별도 증명.
6. 비용/품질/보안 동등성이 불충분하면 V2 운영 전환은 HOLD. V1 619자 방어문은 유지.

## 종료 판정

- A: 본 PR의 무과금 CI 전체 PASS와 운영/모델 호출 불변 — 완료 가능.
- B: 실제 A/B 성능과 모델 보안 동등성 — **비용 사고 정책 때문에 HOLD**.
- C: 무단 유료 호출, 기본 지시문 전환, 구조 변경, 추가 추론 호출 중 하나라도 발생하면 FAIL.
