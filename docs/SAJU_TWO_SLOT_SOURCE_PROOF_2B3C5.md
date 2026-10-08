# 사주 브릿지 2B-3C-5 — 두 슬롯 출처 증빙 교차 검증

- Preview 서버 내부 합성 검증 전용. 기존 공개 API·캐릭터·결제·판매 경로 불변.
- 고정 슬롯: `natal`(`전체 사주`) 및 `relationship`(`연애운`). 각각 별도 nonce, 별도 HMAC, 별도 출생정보 전후 검증을 수행.
- 두 슬롯의 Subject, Birth Profile, Revision ID/번호 일치 및 readingId/responseId/요청 해시/응답 해시 중복 차단.
- 두 슬롯 처리 후 현재 Birth Profile을 한 번 더 인증 조회하고, 정규화 요청 해시를 재구성하여 일치 확인.
- 서명이 정상이어도 Source Semantic Authority는 별도. 해석을 합성해 새로운 Claim을 만들지 않으며, `canExecute/canPublish/canSell=false` 및 `NOT_EVALUATED` HOLD 유지.
- 실제 Saju 보호 호스트 운영 배포, 공유 atomic nonce 저장소, 승인된 Production 의미·정책·상품 결속은 이 PR에 포함하지 않음.
- 테스트는 정상 동작, 슬롯 간 응답·서명 혼용, nonce 재사용, 소유권/Revision 변경, 출처 누락, 최종 DB 재조회 오류를 포함. 테스트 double은 Production 증빙이 아님.
- 신규 대형 CI 없이 기존 변경 범위 CI와 SHA 고정 CI Integration 재사용.
