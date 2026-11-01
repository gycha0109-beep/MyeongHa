# 세연 실제 메시지 전송 장애 — 원인 확정 및 관리자 첫 답장 복구 (2026-11-01)

Watchtower-Track: security

## 사용자 증상
- 세연 채팅에서 `SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`이 반복되고, 화면에는 "안전한 응답 처리가 완료되지 않았습니다" 표시.
- 운영 DB의 최근 2개 `chat_turns`는 `failed_retryable`이고 각 2개 실패 Attempt만 존재. 최신 실패 Attempt는 2026-10-31 20:36:01 UTC(2026-11-01 05:36 KST). 이후 표시된 동일 오류에 대응하는 신규 Attempt/AI 로그/Assistant 메시지는 확인되지 않음.
- 사용자 메시지 원본은 보존됐고, 앞선 PR #2848/#2856으로 12-key DB 원본 Pin과 history 검증 함수는 설치됐다. **그것만으로 HTTP 메시지 전송은 활성화되지 않는다.**

## 차단 지점 (서로 구별)
1. **실제 운영 Cloudflare Worker** `cloudflare/myeongha-worker.mjs`는 정확한 첫 답장 라우트를 가졌고, 인증된 Owner Admin의 `chatCreditExempt`를 DB에서 확인한 뒤 `createCloudflareSeyeonFirstMemoryRuntimeV1`을 사용한다.
2. 내부 `createProductionSeyeonFirstMemoryExecutionV1`는 이전에 모든 요청에 `creditBilling.productionMounted=false`를 적용해 **Owner 면제까지 예외 없이 차단**했다. 관리자에게 필요 없는 private Commerce pool이 없는 경우에도 모델 전 차단.
3. `handleSeyeonFirstPositiveMemoryFetchV1`는 기존 실패 `clientTurnId`의 DB User 메시지 재사용을 `receivedTurn.replayed=true`란 이유만으로 무조건 거부했다. 이는 새 Assistant 생성이 아니라 이전 **User 원본의 멱등 재사용**인데, committed/delivered Assistant replay와 혼동됐다.
4. 별도의 Vercel `chat-turn-send-http.ts`에도 unconditional G3 hold가 있으나, **현재 Cloudflare 첫 답장 경로와 같은 함수가 아니다.** Vercel 전송의 사설 답변 반환 권한을 임의로 열지 않는다.

## 수정 내용 / 보안 경계
- G4 Owner Admin 면제는 기존 `qry_myeongha_owner_admin_access_v1` 및 canonical Member Subject로 재검증. Owner Admin이면서 `chatCreditExempt=true`일 때에만 첫 기억 0건 테스트 요청이 미완성 일반 유료 G4 settlement 없이 전진한다.
- 면제 이외에는 일반 Member/Guest/위조 Owner의 Provider 진입을 계속 차단. `productionMounted=false` 일반 유료 기능도 유지.
- 이전 실패 `failed_retryable` 원본 User turn은 같은 `clientTurnId`와 새로운 Attempt/Commit/DB 원본 receipt issuer를 통과하는 경우에 한하여 재사용 허용. `committed`/`delivered` 응답 replay 및 재사용된 Attempt는 계속 거부.
- 새로운 비밀/대화문 출력 없이 단계 이름만 `MYEONGHA_SEYEON_FIRST_REPLY_STAGE_HOLD`로 기록해 이후 오류를 구체적으로 확인 가능하게 함. 모델 출력 자체·개인정보·원본 DB 조회/ACK/원가 Governor 권한은 변경하지 않음.

## 아직 검증되지 않은 사항
- PR의 CI·전체 통합 검사가 통과해야 운영 병합/배포 가능.
- 실제 DB-verified 관리자 요청이 모델 실행, 정확한 G3 원본 답변 조회, HTTP response, 사용자 receipt ACK 및 비용 기록까지 성공했는지 **실제 운영 증거가 아직 없다.**
- 본 수정은 모든 일반 회원의 유료 채팅 활성화 또는 장기 인격 품질 완료를 의미하지 않음.
- 추가 사용자 전송은 검증·배포 전 요청하지 않음.
