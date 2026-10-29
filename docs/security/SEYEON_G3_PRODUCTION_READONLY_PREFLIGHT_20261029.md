# G3/S0 운영 함수 설치·ACL 읽기 전용 검증

Watchtower-Track: security

이 문서는 운영 실증의 범위를 S0 07/08 읽기 함수 설치/권한 상태로 한정합니다. 운영 공개 승인이나 G3 완료 근거가 아닙니다.

## G3/S0 운영 DB 메타데이터 사전 점검 (읽기 전용)

`production-g3-readonly-preflight.sql`은 07/08 설치 전후 실제 운영 DB의 **PostgreSQL 17, 기존 Subject·Thread·Grant 권한 경계, RLS, API 역할의 직접 테이블 접근 차단, Positive registry 비활성화, 두 신규 읽기 함수의 소유자/SECURITY DEFINER/검색 경로/EXECUTE 권한**만 카탈로그로 확인합니다. 원본 Message, Memory, 회원 식별자 및 자격증명을 읽거나 반환하지 않고 DDL·DML·Role 변경도 하지 않습니다.

정상 설치 후에도 판정은 `CATALOG_ACL_PASS_RELEASE_STILL_HOLD`이며 G3/G6 운영 공개 승인이나 송출 확인을 의미하지 않습니다. `HOLD_07_08_NOT_INSTALLED`은 운영 함수 미설치 상태로, 이 상태에서 `currentlyGranted=false`를 철회 완료로 해석하거나 기존 타 캐릭터의 페이지 응답을 전체 G3 보안 승인으로 볼 수 없습니다. 설치 SQL은 이 점검 파일과 별개이며, 관리형 DB 권한/백업·복구/정확한 배포 SHA/기존 RLS 및 수신 증명 계약을 충족한 후 별도 적용합니다.

## G3 운영 History 함수 장애 시 차단 정책 — 2026-10-29

08 읽기 함수가 운영에 설치된 후에는 해당 함수가 미설치·누락·복구 실패인 상태에서 세연과 무관해 보이는 페이지도 안전하다고 판단할 수 없습니다. `chat-read-http.ts`는 이 경우 과거 참가 여부를 확인할 수 없으므로, 메시지 본문과 Relationship 조회 **이전**에 HTTP `503 SEYEON_HISTORY_REVEAL_HOLD`를 반환합니다. 단일 세연 방의 기존 metadata-only shell에는 추가 본문 공개가 없습니다. 함수가 정상 존재하고 소유 Thread의 이력 결과가 정확히 `false`인 경우에만 다른 캐릭터의 기존 조회를 계속 허용합니다. 전역 Chat read 완화/유료 AI 공개/개인정보 Source Registry 상태는 변경하지 않습니다.
