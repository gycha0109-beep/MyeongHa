# 앱화 M3-β-2b — 모바일 Reader 세션 교체 중 늦은 응답 폐기

상태: 내부 모바일 전송 계약 보강 / Reader Public **OFF** / Paid Reader, Commerce, Grant, T2 미승인.

## 문제

모바일 `readForOfficialReading`은 기존에 최초 활성 Guest/Member bearer로 owned Thread를 조회하고 Reader 응답을 검증했지만, 조회와 생성이 오래 걸리는 동안 로그인 계정/세션이 바뀌면 **이미 요청했던 이전 Subject의 응답을 호출자에게 반환할 가능성**이 있었다. 서버의 접근 검증이 올바르더라도 변경된 계정의 화면에 이전 계정의 응답을 표시하지 않는 클라이언트 방어가 필요하다.

## 구현

- `apps/mobile/src/features/reading/mobile-reader-interpretation-service.ts`에 활성 bearer 동일성 검사를 추가했다. 최초 서버 소유 Thread 조회 직후와 Reader Preview 결과 검증 직후 **새로운 `withActiveBearer` 검사**를 수행한다. 변경을 감지하면 `CLIENT_READER_SESSION_CHANGED`로 응답을 폐기한다.
- 단독 `read` Preview 경로 역시 반환 전에 bearer를 재확인한다.
- Guest→Member 변경, 로그아웃/다른 Member 전환, 토큰 교체는 결과를 보수적으로 거부한다. 무해한 토큰 갱신도 재시도 대상이 될 수 있으며, 이는 클라이언트 프레젠테이션 정책이다.
- Public OFF이면 기존처럼 네트워크/세션 조회를 **시작하지 않는다**.
- 모든 검사는 UI 방어층이다. 서버 exact Grant, Product Rule, A2/A3, PostgreSQL T2 잠금 및 공개 승인 대체 **불가**.

## 검증

`test/mobile-reader-session-race.test.ts`는 지연된 HTTP를 통제하여 (1) Thread 조회 중 Subject 교체 시 Reader POST 0, (2) 해설 생성 중 계정 변경 후 결과 폐기, (3) 직접 Preview 중 변경 폐기, (4) 동일 bearer 정상 전달, (5) Public OFF 네트워크 0을 확인한다.

## 완료 판정 경계

HTTP-06 모바일 stale response 억제의 **부분 구현**이다. 아직 실제 로그아웃/재접속을 포함한 화면 상태 epoch, Reader별 서버 Thread discovery, paid result record persistence/re-read, 최종 T2 승인 및 네트워크 공개/환불 정책, Android/iOS E2E는 미완료다. Owner #1827/#1828 및 Mobile Draft #1823 OPEN/HOLD 유지. 이 작업만으로 앱화 B PASS 선언 금지.
