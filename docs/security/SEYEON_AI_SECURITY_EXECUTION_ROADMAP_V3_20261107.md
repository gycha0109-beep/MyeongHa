# 세연 AI 보안 트랙 — 실행 로드맵 v3

Watchtower-Track: security

> 기준일: 2026-11-07
>
> **핵심 원칙: 새로운 보안 기능을 계속 추가하지 않는다. 이미 구현한 S0 경로를 재사용해 최초 제품 범위를 실제 서비스로 완성한다.**

## 0. 2026-11-08 트랙 복구 및 후속 작업 선택 기준

- **이 로드맵의 유일한 트랙:** 세연 AI 보안, `Watchtower-Track: security`. 작업 기록 정본은 [기존 보안 WORKLOG](SEYEON_AI_SECURITY_IMPLEMENTATION_STATUS_AND_ENDPOINTS_20261030.md)의 W129 → **W130 복구 기록**이다. 별도 운영·재해복구 `ops`의 Phase 8~13, PR #3105/#3112/#3113/#3115, `docs/operations/...` WORKLOG는 이 로드맵의 다음 단계가 아니다.
- **재개 지점:** 병합된 보안 [PR #3106](https://github.com/gycha0109-beep/MyeongHa/pull/3106) 이후의 미수용 S0 Gate(G0~G6, 0/7). 먼저 G0 D1~D5의 실제 미확정 기술 계약과 G1 결합 원본 Pin의 운영 설치·실효 권한을 확인한다. 이어서 기존 단계 **G1 → G4 → G2 → G3 → G5 → G6**를 증거·승인 범위 내에서 진행한다. `HOLD_FORWARD_STOPPED` 유지.
- **채팅·자동화·이관 복구 규칙:** 이전 답변이나 마지막 GitHub PR이 `ops`를 가리켜도 `security`의 로드맵/WORKLOG와 대조해 일치하지 않으면 **기존 보안 작업을 자동으로 운영 단계에 연결하지 않는다**. `Watchtower-Track`·브랜치·변경 파일·기존 WORKLOG의 트랙 소유권을 먼저 확인한다. 공동 저장소라는 이유, 운영 DB 또는 공통 CI와 연관됐다는 이유만으로 트랙을 전환하지 않는다. CI 수용도 동일 PR/커밋의 `security` 실행만 이 작업의 중단·완료 근거로 쓴다.
- **자료 보존:** 잘못 선택된 운영 트랙의 기존 기록·PR은 역사적 증거로 남기되 AI 보안 완료로 재분류하지 않는다. 운영 DB/Role/ACL/Secret/Hosted/Provider/과금/배포 변경 권한과 G0 기술 승인은 각각 분리한다. 이 문서 변경은 그 승인을 대신하지 않는다.

## 1. 이 문서의 권한과 적용 범위

- 이 문서는 세연 AI 보안 트랙의 **실행 순서와 작업 범위**를 정하는 최신 로드맵이다.
- `SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md`는 G0~G6의 **완료 증거와 보안 합격 기준**을 계속 정의한다. 이 문서는 그 기준을 낮추거나 대체하지 않는다.
- 2026-10-25 운영 적용 문서에 이미 명시된 S0 제품 범위를 다시 기준으로 삼는다. 과거에 참조되었으나 현재 main에 존재하지 않는 V2 로드맵을 복원하거나 추정하지 않는다.
- 기존 구현·테스트·SQL·CI 결과를 먼저 재사용한다. 기존 실패를 해결하는 데 필요한 변경 외에 새 방어 계층, 별도 실행 흐름, 광역 테스트를 추가 과제로 만들지 않는다.
- 이 로드맵 개정·병합은 운영 DB 변경, Secret/Role/ACL 변경, 유료 Provider 호출, 공개 Route 활성화 또는 배포 승인이 아니다.

## 2. S0 제품 범위 — 여기서 더 넓히지 않는다

### 포함

1. 인증된 현재 Member와 현재 Thread/Turn/Attempt.
2. 사용자가 명시적으로 허용한 원본 `conversation_recall/v1` Memory **정확히 1건**.
3. 현재 요청의 원본 User 메시지 1건.
   - 이 User 메시지는 현재 요청의 입력 출처이며 장기 Memory가 아니다. Memory Grant를 대신하지 않고, 별도 동의 없이 장기 기억으로 저장하지 않는다.
4. 위 두 입력의 출처·권한을 서버와 DB가 확인하고, 모델 호출 전에 정확한 사용 집합을 불변 Pin.
5. 최초 AI 답변 1회, **비스트리밍** 전달.
6. 동일 원본 Grant의 현재 권한을 Commit·최초 공개 시점에 재검증하고, 전달 receipt/ACK 및 철회 경계를 확인.
7. 모델 비용의 서버 측 사전 승인과 일반 고객 크레딧 예약·수신 증명·정산 경로.

### 제외 — S0에서는 계속 닫아 둔다

- 새 Memory 추가/관리 UI 및 Memory Proposal 수락 경로.
- 다중 Memory, Life Fact, 임의 Record Type/Schema 또는 여러 원본을 섞는 모델 입력.
- 과거 User/Assistant 대화, Relationship Event, Reader/공식 Reading 지식, 인용·복사된 파생 개인정보를 모델 입력으로 재사용하는 기능.
- History 본문 공개, Replay/재생성, 후속 Worker가 과거 답변을 다시 전달하는 기능.
- Streaming, 답변 일부 선공개, 공개 Route의 범용 활성화.
- 보안 프롬프트 V2 실모델 실험, 별도 캐릭터/Reader 확장, 플랫폼 전체 OWASP 재감사.

제외 항목은 삭제하거나 임의 필터링해 통과시키지 않는다. 모델 입력에 출처가 확인되지 않은 과거 기록이 섞이거나 S0 범위를 판정할 수 없으면 요청 전체를 HOLD한다. 기존 기록, 실패 Attempt, Client Turn ID는 우회 목적으로 삭제·교체하지 않는다. History/Replay/Worker/Reader 경로는 별도 승격 전까지 계속 차단한다.

**스트리밍 정책:** S0는 OFF로 고정한다. 이미 전송된 바이트를 회수할 수 없으므로 최초 답변 전체의 권한 확인과 전송 순서를 검증한 뒤에만 공개한다. 이는 S0 실행 범위 결정이며, 향후 Streaming 기능을 승인하는 의미가 아니다.

### S0 길이 및 자원 제한

- **HTTP ingress:** `POST /api/chat/:threadId/turns`는 실제 body stream 기준 최대 16,384 bytes, body 완료 기한 3,000ms, 현재 User text 최대 8,000자다. 초과는 413, body가 기한 내 완료되지 않으면 408이다. `Content-Length`만 믿거나 `request.json()`으로 먼저 전체 버퍼링하지 않는다.
- **연관 Reading ingress:** `POST /api/me/saju/preview-reading`도 동일 16,384-byte/3,000ms bounded reader를 사용하며 `readingText`는 최대 200자다. 이 경로는 S0 Memory 답변 입력에 포함되지 않는다.
- **모델 요청:** 최종 직렬화 요청은 최대 524,288 bytes, 인증된 OpenAI input-token count + 1,024-token headroom은 최대 48,000 tokens, Provider-enforced output은 최대 4,096 tokens다. context window policy는 1,050,000 tokens, prompt caching은 OFF다.
- **토큰 인증:** 정확한 최종 요청 body에서 공식 `/v1/responses/input_tokens` 응답으로 input token 상한을 인증한다. headroom 1,024를 더한 값이 48,000을 넘으면 generation을 거부한다(따라서 raw count 상한은 46,976). count 응답은 최대 8,192 bytes, timeout은 8,000ms이며 문자 수 추정/4 나누기 fallback은 없다. 이 인증은 G1 원본 Pin 이후, 실제 generation 이전에만 수행한다.
- 위 제한은 기존 구현의 합격 기준이며 새 보안 기능을 추가하는 항목이 아니다. token count/Provider 단계 실패 후 고객 예약 환불·복구는 G4 미완료 항목으로 별도 추적한다.


## 3. 현재 구현 기준점 — 다시 만들지 말 것

| 영역 | 이미 확보한 구현·증거 | 아직 실제 제품 완료로 볼 수 없는 부분 |
|---|---|---|
| G1 출처 Pin | 0건 선행 Pin, 최종 모델 입력 선택 검사, 단일 Memory + 현재 User를 결합하는 S0 Pin SQL/서버 연결 코드가 존재하고 실행 순서에 연결됨 | 운영 Source Registry에 `conversation_recall/v1` 1행이 등록돼 있으나 `enabled=false`, `writable_enabled=false`이며 `positiveMemoryFirstReplyApproved=false`; 운영 대상 DB에서 exact positive Pin 성공 및 Provider 0회 실패 증거 미확정 |
| G2 Commit | S0 원본 Grant 잠금·digest 확인과 기존 `cmd_commit_seyeon_chat_turn_runtime_v2`를 사용하는 원자 Commit 경로가 존재 | 현재 운영 함수/ACL과 정확한 S0 Pin의 연결, 운영 대상 DB에서 취소 경합을 포함한 완료 증거 |
| G3 최초 공개 | 최초 답변 발행·receipt/ACK·철회 관련 DB/서버 경로 및 실패 시 HOLD가 구현되어 있음 | 실제 배포 Worker의 HTTP 송출·receipt ACK·철회 순서가 한 번의 실제 경로에서 증명되지 않음. History/Replay는 계속 제외 |
| G4 비용·실행 권한 | W115~W121 비용 정책 고정 및 최소 권한 검사 재사용. G1 Pin 이후 크레딧 예약, G5 전용 Hyperdrive 후보, receipt 정산 bridge를 Worker 경로에 조건부 연결 | Cloudflare G5 Commerce Hyperdrive/운영 LOGIN·Secret·Role 미구성, `creditBilling.productionMounted=false`; 일반 고객 예약·정산 실운영 증거 미확정 |
| G5 통합 검증 | 기존 S0 PostgreSQL 격리 테스트, PG15/17 호환성 검증 및 PR #3089 exact-head 전체 Integration 성공 | S0의 최종 운영 전송 경로와 취소 경쟁을 포함한 통합 증거, 배포 대상과 일치하는 실환경 검증 |
| G6 제한 운영 | 백업·격리 복원·forward stop 등 기존 운영 증거가 존재 | 이번 S0 범위의 제한 smoke, 안전 로그/알림, 되돌리기 절차와 최종 운영 증거 묶음 |

위 표의 '구현 존재'는 재사용 대상이지 Gate PASS가 아니다. 반대로 Gate가 HOLD라는 이유로 이미 존재하는 코드를 다시 작성하지 않는다. 완료 여부는 정확한 코드·DB·HTTP 실행 증거로 판정한다.

### 기준 커밋과 작업 정리

- 기준 main: `0f60f5d74f509f8ede422130efc65839480726ed` (PR #3094 병합, 전체 Integration run `42282815736` GREEN; 이후 최신 main 기준으로 재정렬).
- W121 권한 검사 및 PostgreSQL 15/17 호환성 수정은 [PR #3089](https://github.com/gycha0109-beep/MyeongHa/pull/3089)로 병합됐다. 해당 PR의 전체 Integration 성공을 기존 근거로 재사용한다.
- 오래된 [PR #2761](https://github.com/gycha0109-beep/MyeongHa/pull/2761)은 오래된 base·155개 파일·충돌 상태의 누적 브랜치다. 이 로드맵의 작업 기준이나 재개 브랜치로 사용하지 않는다. 이미 main에 들어간 변경은 main에서 재사용한다.
- 기존 작업 기록은 `SEYEON_AI_SECURITY_IMPLEMENTATION_STATUS_AND_ENDPOINTS_20261030.md`의 W01~W123을 보존한다.

## 4. 수정된 실행 순서

실행 순서는 보안 게이트 번호가 아니라 실제 요청의 의존관계를 따른다. 각 단계에서 이미 통과한 세부 검증은 다시 실행하지 않고, 누락된 증거만 보충한다.

### 0단계 — S0 범위와 G0 계약 고정

- 위 S0 포함/제외 범위를 실행 기준으로 고정한다.
- 동의 철회, 취소된 Grant ID의 재사용 금지, 재동의 시 새 Grant ID를 발급하더라도 기존 Attempt를 소급 구제하지 않는 규칙, Record 변경·DB 장애·비스트리밍 최초 공개의 선형화 규칙을 S0 계약에 반영한다.
- 과거 대화·Relationship·Reader 등 제외 데이터는 입력하지 않고 기존 HOLD를 유지한다. 이 범위의 전체 파생 lineage를 S0 완료 조건으로 다시 확장하지 않는다.
- 기술 계약에 남은 미확정 transport/revoke 조건만 해결한다. 제품 범위 밖의 모든 출처 유형을 한꺼번에 승인하려 하지 않는다.

**완료 증거:** S0 범위가 버전 문서와 테스트 기대값에 일치하고, 철회·재승인·오류·전송 경계가 명시되어 있으며 G0 승인 기록이 존재한다.

### 1단계 — G1: Memory 1건 + 현재 User 1건의 모델 전 Pin 완성

- 기존 `17-g1-positive-combined-model-source-pin.sql`, 서버 Pin adapter/port 및 0건 Pin 경로를 재사용한다.
- 모델에 실제 전달되는 Memory 1건과 현재 User 메시지 1건만 동일 Subject/Thread/Turn/Attempt에 묶는다.
- 정확한 Record/Grant/type/schema/raw digest/projection digest/현재 User message digest와 빈 집합 상태를 구분해 모델 호출 전에 DB에 불변 저장한다.
- Pin 누락·불일치·DB 오류·미지원 schema에서는 Provider 호출 0회를 보장한다.
- 과거 메시지·Relationship·Reader 등 제외 데이터가 Context에 섞이지 않는지 확인한다. 섞이면 부분 제거 후 계속하지 말고 전체 HOLD한다.

**완료 증거:** 실제 S0 실행 경로에서 Provider 이전 Pin 성공, Pin 누락/변조/철회/Subject·Thread 불일치 시 Provider 호출 0회, 정확한 DB 영속성 및 불변성.

### 2단계 — G4: 모델 실행 전 Governor와 고객 크레딧 경로 완성

- W115~W121의 비용 설정 고정·최소 권한 검사를 재작성하지 않고 기존 구현을 사용한다.
- 전용 실행 LOGIN/역할의 운영 자격증명·TLS·권한을 대상 DB에서 확인한다. 권한 누락·과다·불명확 시 전환을 거부한다.
- 일반 고객 요청에 대해 서버가 모델/요금/예산을 확정하고 크레딧 예약을 원자적으로 수행한다.
- 최초 답변의 durable receipt/ACK를 기준으로 예약을 정산하며, 중복 ACK·재시도·장애에서 중복 차감이나 무단 호출이 없도록 한다.
- Owner Admin 면제는 제한된 내부 smoke에만 사용한다. 이를 일반 고객 결제 완료로 계산하지 않는다.

**완료 증거:** 실제 대상 Runtime에서 모델 호출 전 비용 승인·고객 크레딧 예약이 필수이며, receipt 기반 정산·멱등성·실패 복구가 검증되고 운영 mount 상태가 증거로 확인된다.

### 3단계 — G2: 기존 채팅 Commit과 같은 트랜잭션으로 확정

- 기존 `cmd_commit_seyeon_chat_turn_runtime_v2`와 S0 원자 Commit 코드를 재사용한다.
- G1 Pin의 정확한 원본 Grant/Record 및 현재 상태·digest를 같은 DB 트랜잭션에서 잠그고 확인한 뒤 Commit한다.
- 별도 SELECT 후 Commit하는 경로를 만들지 않는다.
- Grant 취소/Record 변경과 Commit이 경쟁하면 DB 잠금 순서에 따라 한쪽만 유효하게 확정되고, 취소된 원본으로 Commit되지 않아야 한다.

**완료 증거:** 운영 경로에서 동일 트랜잭션 결속, 독립 DB 세션 취소↔Commit 경쟁, 실패 시 전체 rollback 및 재시도 멱등성.

### 4단계 — G3: 최초 비스트리밍 HTTP 답변·receipt·철회 완성

- S0 최초 답변 한 번만 실제 대상 Cloudflare Worker transport로 전달한다.
- DB가 현재 Grant와 Commit을 확인한 뒤 최초 공개를 허가하고, 실제 송출 결과를 receipt/ACK로 연결한다.
- 전송 전 철회, 전송 도중 취소, ACK 유실/중복, HTTP 오류에서 비인가 답변 바이트가 공개되지 않고 중복 정산도 발생하지 않도록 한다.
- Node 응답 완료나 Fetch Response 생성만으로 실제 브라우저 전달을 증명했다고 간주하지 않는다. 대상 Worker/HTTP transport의 실제 결과가 필요하다.
- History/Replay/재생성/후속 Worker 공개 경로는 계속 HOLD한다. S0를 끝내기 위해 이 기능들을 구현하지 않는다.

**완료 증거:** 실제 배포 대상과 동일한 transport의 최초 HTTP 응답, receipt/ACK, revoke 경합 결과가 연결된 재현 가능한 증거. 스트리밍 및 Replay는 OFF/HOLD 상태가 유지됨을 확인.

### 5단계 — G5: S0 범위만 정확한 HEAD로 통합 검증

- 기존 security, db-authority-core, PostgreSQL 15/17, S0 E2E, Worker/HTTP 테스트와 전체 Integration을 재사용한다.
- G1 Pin → G4 사전 승인 → 모델 실행 → G2 Commit → G3 최초 HTTP 송출/receipt ACK의 단일 S0 경로를 검증한다.
- DB 독립 2세션으로 Commit↔Revoke 및 Reveal↔Revoke 경쟁을 검증한다. 기존 테스트가 정확한 운영 함수/계약을 이미 증명하면 그 결과를 재사용하고, 빠진 시나리오만 보충한다.
- 정확한 PR HEAD의 필수 CI·GitGuardian·전체 Integration 및 병합 후 main 검사 결과를 기록한다.
- 새로운 CI Workflow를 만들지 않는다. 기존 워크플로와 실행기를 사용한다.

**완료 증거:** 동일 S0 범위와 exact SHA에 연결된 PostgreSQL/HTTP/경합/권한 검사 및 전체 Integration 성공. 핵심 비인가 공개·무단 Provider 호출·중복 과금은 0회.

### 6단계 — G6: 제한 운영 smoke와 종료 증거

- 사용자 승인된 범위·계정·예산으로만 제한 smoke를 수행한다.
- 대상 배포 Worker SHA/버전, DB migration/ACL/역할, Provider 호출·비용·크레딧 원장, HTTP 응답·receipt/ACK를 서로 대조한다.
- 개인정보 원문·Grant ID·토큰·비밀키를 로그/증거에 남기지 않는다. 단계·오류 코드·시간·검증 결과만 남긴다.
- forward stop, 기존 receipt/철회 보존, 복구/롤백 절차를 확인한다.
- 최종 PASS/HOLD, 배포 SHA, 증거 URL, 잔여 위험을 기록한다. 일반 고객 공개/유료 트래픽은 별도 승인 범위대로만 연다.

**완료 증거:** 제한 운영 smoke 성공, 관측·중단·복구 증거, exact deploy/main SHA, 명시적 운영 승인.

## 5. 현재 남은 작업 — 실제 블로커만

| 순서 | 남은 작업 | 완료를 막는 현재 증거 공백 |
|---|---|---|
| 1 | S0 G0 계약 마감 및 G1 양수 Pin의 실제 실행·설치 연결 확인 | G0 기술 계약 미승인, 운영 대상 DB에서 exact positive Pin이 실제 사용되는 증거 미확정 |
| 2 | G4 운영 Governor·일반 고객 크레딧 연결 | W121 코드는 병합됐으나 `creditBilling.productionMounted=false`; 운영 LOGIN/Secret/TLS 및 예약·receipt 정산 Runtime 미장착 |
| 3 | G2 Commit과 G3 최초 HTTP transport 종단 연결 | 기존 SQL/코드는 존재하지만 실제 Worker 송출·receipt ACK·철회 경쟁의 완전한 성공 증거 미확정 |
| 4 | G5 S0 종단 통합 증거 | 기존 격리 CI는 재사용 가능하나 실제 S0 전체 경로와 운영 대상 transport의 증거가 남음 |
| 5 | G6 제한 운영 smoke·복구·최종 승인 | 실제 운영 범위의 성공·롤백·관측 증거 미확정 |

위 순서는 새 기능 목록이 아니다. 이미 구현된 항목은 증거를 재사용해 닫고, 실제로 끊긴 연결만 수정한다. 작업 중 새로운 출처 유형이나 제품 기능이 발견되어도 S0에 편입하지 않고 HOLD/후속 목록으로 보낸다.

## 6. 후속 범위 — S0 종료를 막지 않는다

- 다중 Memory/Life Fact 및 새 기억 추가 UX.
- 과거 대화 전체의 권한 상속, Relationship Event의 광범위한 파생 출처, Reader/공식 Reading 교차 권한.
- History/Replay/재생성 및 후속 Worker 공개.
- Streaming.
- AI 보안 프롬프트 V2 실모델 평가(#1816). V1 유지 상태에서 S0 종료의 선행 조건으로 취급하지 않는다.
- Reader 구매 기반 권한(#1827)은 Reader 연동을 다시 승인할 때 별도 수행한다.
- 플랫폼 전체 OWASP 재감사(#1529)는 별도 트랙이다.
- R2-G 과거 실행자 추적은 기존 `CLOSED_RISK_ACCEPTED` 결정을 유지하며 같은 과거 로그 부재를 이유로 개발을 다시 차단하지 않는다. 남은 현재 DB 객체/권한 정합성 검증은 해당 독립 범위에서만 처리한다.
- 전체 재해복구(DR) 인증이나 모든 미적용 migration 일괄 적용을 S0 종료의 새 조건으로 추가하지 않는다. S0에 필요한 백업·롤백·복구만 증명한다.

## 7. 절대 유지할 안전 경계

- 개인기록 Projector 기본값 `[]`, 공개 Route OFF, `WRITE_DARK`/`HOLD_FORWARD_STOPPED`를 필요한 증거와 승인 전까지 유지한다.
- 모델 호출 전 Pin 실패, 권한 미확인, DB 오류, transport 증명 누락은 fail-closed.
- 운영 DB DDL/DML/ACL/Role/Secret, Provider 유료 호출, 배포·트래픽 활성화는 이 문서 병합만으로 실행하지 않는다.
- 운영 적용 시 기존 S0의 승인된 forward-only SQL과 좁은 실행 권한만 사용한다. 자동 migration 등록이나 광역 권한 부여로 우회하지 않는다.
- 새 CI Workflow 금지. Watchtower-Track은 정확히 `security`로 기록한다.
- PR 병합, CI GREEN, 격리 PostgreSQL 테스트만으로 운영 PASS나 제품 출시를 선언하지 않는다.

## 8. 완료 선언 규칙

- **A — 구현:** 승인된 S0 범위의 G0~G4 실제 실행 경로가 연결되어야 한다.
- **B — 검증:** G5에서 정확한 S0 경로의 실DB·HTTP·독립 세션 경쟁·권한·비용 검증이 통과해야 한다.
- **C — 운영:** G6에서 제한 smoke·안전 관측·중단/복구·승인 증거가 있어야 한다.
- S0 종료는 같은 활성화 범위에서 A+B+C가 모두 PASS일 때만 선언한다.
- G0~G6의 미완료 개수(예: 0/7)는 개발량이나 전체 진척률이 아니다. 각 Gate의 부분 구현과 증거 상태를 별도로 보고하며, 근거 없는 백분율·기간을 만들지 않는다.
- S0 완료 전 신규 기능을 임의로 추가하지 않는다. S0의 필수 구현·검증·문서화가 모두 끝나면 `ROADMAP_COMPLETE`를 선언하고 작업을 종료한다.

## 9. 개정 이력

- **v3 / 2026-11-07:** S0 최초 제품 범위를 다시 고정하고, 기존 구현 재사용·실제 요청 의존 순서(G0→G1→G4→G2→G3→G5→G6)로 재배치. History/Replay/Reader/다중 기억/Streaming 및 별도 프롬프트·플랫폼 감사는 후속 범위로 분리. 기존 G0~G6 완료 증거 계약은 유지.
- **트랙 오귀속 복구 기준 / 2026-11-08:** S0 v3 본래 범위를 바꾸지 않고, `security`의 최신 W129/W130 WORKLOG·PR #3106 기준과 `ops` Phase 8~13의 분리 및 이관/자동 진행 시 식별자 확인 규칙을 명문화.
