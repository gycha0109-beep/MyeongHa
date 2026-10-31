# 세연 기억 0건 첫 대화 — Cloudflare G3 수신 증명과 비용 보호

Watchtower-Track: security

## 구현 목표
- 서버가 검증한 관리자 Member의 **기억 0건 / 첫 Turn**만 대상으로 한다. 기존 기억 1건(G1 원본 Memory) 경로는 별도로 유지한다.
- 긍정적인 답변은 모델 생성 결과에서 직접 반환하지 않고, DB에 커밋된 원본 Assistant 메시지 1건을 **현재 원본 소스 제약을 잠그는 SQL**로 읽은 뒤 HTTP 응답을 발행한다.
- 새 HTTP 발행은 기존 S0의 `deliveryReceipt` 256-bit challenge/증명, 발행-수신 기록, 브라우저의 ACK 처리를 변경하지 않는다. 고정 proof 도메인은 `seyeon-positive-http-receipt-v1`이며, 출처가 없다는 사실이 임의의 원본 접근 권한이 되는 것은 아니다.
- ENFORCE Provider 비용 예약·정산, 관리자 크레딧 면제 확인, 사용자 인증, G0 원본 사용자/과거 Assistant 출처 검증 및 채팅 Commit 계약은 기존 상태를 유지한다.

## 서버 분기 및 이중 검증
- `SEYEON_SECURITY_S0_PRODUCTION_V1.zeroSourceFirstReplyApproved`는 서버 코드에 고정된 값이다. HTTP 필드, URL, 브라우저, 환경변수로 설정할 수 없다.
- 최초 답장은 `requiredPersonalRecordCount:0`을 지정하여 **실제 모델에 선택된 개인정보 원본이 0건임을 모델 호출 전** 강제한다. 1건 이상이면 사전 차단한다. 기존 긍정 기억 경로에서는 정확히 1건을 강제한다.
- HTTP 수신 증명 발행 직전에 DB 권한 보유, SECURITY DEFINER postgres 소유, 고정 RLS/검색 경로, 공개 역할의 실행 차단을 검증한다.
- 실행 권한은 `myeongha_api_executor`에만 있다. SQL은 기존 `qry_seyeon_locked_first_zero_source_reveal_v1`을 호출하여 현재 사용자·첫 Turn·정확한 zeroProof Pin·후속 관계 기록 부재·동일 Assistant 본문을 독립적으로 검증한다.
- 모델과 브라우저는 SQL로 전달되는 사용자 메시지/답변을 지정하지 않는다. 서버의 이미 커밋된 Turn/Attempt/User/Assistant/Outbox 식별자를 SQL이 재검증한다. 발행 전에 challenge 원문이 아닌 receipt hash만 DB에 저장한다.
- 활성 대화가 아닌 과거 보관함의 메시지·이미 발행된 답변·복수 메시지·관계 파생 출처가 있는 대화는 재발행할 수 없다.

## 운영 DB 적용
- 원본 SQL: `scripts/operations/seyeon-security-s0/16-zero-source-http-receipt-issuer.sql`
- 2026-11-01 운영 PostgreSQL에 원자적 `apply_migration` 성공.
- 함수 owner `postgres`, SECURITY DEFINER true, `row_security=off`; 실행 권한은 `myeongha_api_executor`에게만 부여되고 `anon`, `authenticated`, `service_role`은 접근 불가.
- 현재 DB 원본 zero-source locked read와 기존 delivery ACK 함수의 설치를 확인. 기존 긍정 기억 발행·권한은 수정하지 않음.

## 실증과 제한
- API 테스트는 첫 reply 문맥 소스 0건 강제와 발행 SQL의 사전 준비 거부·정확한 응답 영수증 경로를 검증한다.
- Worker에서는 사용자 인증·관리자 크레딧 면제 확인이 계속 선행한다. **실제 인증된 사용자 송신과 GLM 비용 영수증은 이 코드·DB 설치만으로 증명되지 않는다.** 배포 후 같은 로그인에서 새 세연 방을 열고 1회 송신하여 사용자 화면 수신, receipt ACK, GLM 모델 원가 예약·정산을 별도로 확인해야 한다.
- 범위는 첫 답장 한 건이며, 후속 multi-turn/과거 답변 Replay/기억 1건과의 자동 전환은 이 변경에 포함하지 않는다. 두 번째 Turn에서 출처를 안전하게 사용하기 위한 별도 원본 증명 설계가 필요하다.
- 보호 실패 시 새 유료 모델 호출·답변 원문 반환·재시도를 허가하지 않는다.
