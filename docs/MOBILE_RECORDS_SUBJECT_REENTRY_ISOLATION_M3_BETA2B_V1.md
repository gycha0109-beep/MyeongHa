# 앱화 M3-β-2b — Records/Official Reading 재진입 Subject 격리

상태: 서버 소유 Records 보존 / 모바일 화면 방어 구현 / Reader Public OFF / Paid Grant·Reader Thread 계약 HOLD.

## 확인된 결함

기존 `native-mobile-records-controller`는 Subject 구분자가 없는 프로세스 전역 singleton으로 Records 목록(삶의 사실/지난 읽기/기억)을 60초 메모리에 보관했다. 모바일 탭을 떠났다가 다른 Member로 로그인해 돌아오면 처음 그려지는 화면에 과거 Subject의 기록이 표시될 수 있었고, 구버전 `loadInitial()/loadMore()`의 비동기 응답은 리셋 후에도 캐시를 다시 채울 수 있었다.

공식 Reading 상세도 마지막 응답이 도착한 순서대로 화면을 교체하므로, `readingId` 전환·탭 blur·계정 교체가 요청 중 발생할 때 이전 기록이 늦게 표시될 가능성이 있었다.

이 항목은 **클라이언트 캐시·화면의 Subject 격리**이며 DB의 공식 Reading 소유권 결함이나 서버 권한 우회를 입증한 것은 아니다.

## 실제 구현

1. `mobile-records-service.ts` — 모든 Records 페이지와 단건 Official Reading의 원래 active bearer를 HTTP 응답 직후 다시 확인한다. Guest→Member, 로그아웃, 다른 Member, bearer 변경 시 `CLIENT_RECORDS_SESSION_CHANGED`로 데이터 반환 거부한다. 운영 current exact Grant 부여는 전혀 하지 않는다.
2. `mobile-records-repository.ts` — 삶의 사실, 사주 읽기 이력, 기억 컬렉션마다 `reset()`을 구현한다. 캐시/커서/in-flight를 제거하고 generation이 바뀐 오래된 `loadInitial`/`loadMore` 응답은 새 Subject 상태를 덮지 않는다. refresh 중 세션 변경으로 실패하면 기존 항목을 비워 fail-closed.
3. `mobile-records-controller.ts` — 모든 컬렉션의 atomic UI-snapshot reset과 TTL timestamp invalidation을 제공한다.
4. `use-mobile-records.tsx` — 과거 전역 캐시를 첫 렌더에 직접 보여주지 않는다. focus마다 새 archive를 조회하고, blur 시 캐시·화면을 비운다. focusEpoch 비교로 이전 탭의 늦은 promise가 다음 탭 화면을 변경하지 않게 한다.
5. `app/reading/[readingId].tsx` — 상세도 focus/route에 묶인 requestEpoch로 최신 요청만 표시한다. blur 시 기존 공식 풀이 내용을 비우며, 세션 변경 실패를 과거 Subject 본문 대신 보호 안내로 투영한다.
6. `test/mobile-records-subject-isolation.test.ts` — 세션 전환 중 4종 조회 폐기, 정상 단건 re-read, 초기·페이지 추가 fetch와 reset 경합, TTL cache reset, refresh 중 Subject 교체, focus-epoch 구조 확인.

## 적용 경계 / 후속 작업

- Records 아카이브는 SRC-37 정책대로 server-owned Official Reading 저장본을 재열람한다. Reader/Chat Thread를 추정·발급·선택하지 않는다.
- 이번 변화는 **화면 블러·복귀 및 네트워크 경계**에서 기록이 섞이지 않도록 하는 보수적인 클라이언트 보호다. 화면이 계속 보이는 동안 OS 밖에서 세션이 즉시 변경되는 모든 사건을 구독하는 라이브 세션 이벤트 모델은 별도 과제다.
- bearer 재발급만 발생해도 오래된 응답은 재시도 대상으로 거부될 수 있다. 클라이언트 보안에 유리한 보수적 동작이다.
- D-05 서버 소유 Reader Thread discovery, D-02 T2 reveal lock, D-01 saleability, D-07 Reader별 paid interpretation 저장·재열람과 후속 Chat은 구현하지 않았다. #1827/#1828/#1823 승인 HOLD, Public Reader OFF 유지.
- B 전체 완료 판정은 여전히 HOLD다.

검증: 모바일 관련 테스트/타입·Android/iOS Bundle·Scoped CI·Full Integration·post-merge main을 해당 PR의 **실제 완료 CI 결과**로 별도 판정한다. 이 문서는 테스트 성공을 사전 주장하지 않는다.
