# M3-β-2b — 기록 화면 활성 상태에서 인증 변경 즉시 무효화

> 구현 범위: native mobile credential-store persistence event → Records 목록·단건 공식 Reading 메모리 무효화. Reader Public OFF. 서버 Admission/Grant 또는 결제 기능이 아니다.

## 해결하는 결함

PR #1900은 서버 응답 직후 bearer 재확인 및 blur/focus 재진입 시 Records/Official Reading의 캐시를 비우도록 했다. 하지만 **기록 화면이 계속 활성 상태인 동안** 이메일 로그인, 소셜 로그인, 새 회원 가입, 로그아웃, Member refresh/expiry, Guest credential 재발급이 이루어지면 이전 Subject의 화면 내용이 재조회나 탭 이탈 전까지 남는 간극이 있었다.

이번 PR은 성공적으로 영속화/삭제가 **검증된 이후** 전달되는 로컬 이벤트만을 이용해 해당 화면을 무효화한다.

## 데이터·권한 경계

- `mobile-subject-credential-changes.ts`: token-free callback 등록·해제·통지. token, Subject ID, Grant 증명은 이벤트 payload로 전달하지 않는다. 등록 중 개별 listener 예외는 다른 화면의 invalidation을 막지 않는다.
- `member-session-store.ts`: verified write 이후 기존 Member의 안정된 `user.id`와 비교한다. 다른 Member/최초 로그인/성공한 clear는 통지하며 **같은 Member의 token refresh는 통지하지 않는다.** `user.id`가 없는 보수적 fallback에서는 access token이 달라지면 통지한다. stale expected bearer clear/영속 실패는 통지하지 않는다.
- `guest-credential-store.ts`: `subjectId` + `guestSessionId` 기준 실제 Guest 교체/최초 bootstrap/clear 성공 시 통지한다. 동일 Guest의 bearer token 회전만으로 재조회 루프를 만들지 않는다.
- `use-mobile-records.tsx`: focused 상태에서 credential event 수신 즉시 세 컬렉션 캐시/TTL/in-flight를 reset한다. 현재 Subject로 다시 조회하며 오래된 fetch는 requestGeneration과 focusEpoch로 폐기한다. blur에서 구독 해제.
- `app/reading/[readingId].tsx`: 이벤트가 발생하면 읽고 있던 Official Reading 본문을 즉시 가리고 기존 요청 epoch를 폐기한다. 새 canonical Subject로 동일 기록 ID를 재조회하며 서버가 거부하면 보호 오류만 보여준다. blur에서 구독 해제.
- `test/mobile-subject-credential-changes.test.ts`: Member/Guest write 및 clear 전파, 실패/stale clear 비전파, 여러 listener 예외 격리, 구독 해제, 화면 구독·공개 OFF 정적 검사.

## 유효성·남은 한계

- 변경 감지는 **이 앱 런타임의 공인 Store adapter**를 통해 완료된 credential mutation에만 적용된다. 외부 프로세스에서 SecureStore를 직접 변조하거나 앱이 이미 종료된 상태의 OS 단위 이벤트 구독은 포함하지 않는다. 화면 재진입은 #1900에 따라 강제 재검증한다.
- 같은 Subject에서 인증 토큰만 교체되면 화면 이벤트를 발생시키지 않는다. 요청 완료 뒤 bearer 비교에서 오래된 응답은 여전히 폐기된다. 로그인 상태 변경과 실제 Reader/Official Reading 접근 승인은 서버가 결정한다.
- 기존 Reader 공개 스위치, Offer, Charge Terms, Grant, Product Capability, D-05 Thread discovery와 유료 해설 공개 API는 전혀 변경하지 않는다.
- 전체 앱화 B/C 판정은 별도이며 이번 변경으로 완료 처리할 수 없다.
