# G3/S0 운영 함수 설치·ACL 읽기 전용 검증

Watchtower-Track: security

이 문서는 운영 실증의 범위를 S0 07/08 읽기 함수 설치/권한 상태로 한정합니다. 운영 공개 승인이나 G3 완료 근거가 아닙니다.

## G3/S0 운영 DB 메타데이터 사전 점검 (읽기 전용)

`production-g3-readonly-preflight.sql`은 07/08 설치 전후 실제 운영 DB의 **PostgreSQL 17, 기존 Subject·Thread·Grant 권한 경계, RLS, API 역할의 직접 테이블 접근 차단, Positive registry 비활성화, 두 신규 읽기 함수의 소유자/SECURITY DEFINER/검색 경로/EXECUTE 권한**만 카탈로그로 확인합니다. 원본 Message, Memory, 회원 식별자 및 자격증명을 읽거나 반환하지 않고 DDL·DML·Role 변경도 하지 않습니다.

정상 설치 후에도 판정은 `CATALOG_ACL_PASS_RELEASE_STILL_HOLD`이며 G3/G6 운영 공개 승인이나 송출 확인을 의미하지 않습니다. `HOLD_07_08_NOT_INSTALLED`은 운영 함수 미설치 상태로, 이 상태에서 `currentlyGranted=false`를 철회 완료로 해석하거나 기존 타 캐릭터의 페이지 응답을 전체 G3 보안 승인으로 볼 수 없습니다. 설치 SQL은 이 점검 파일과 별개이며, 관리형 DB 권한/백업·복구/정확한 배포 SHA/기존 RLS 및 수신 증명 계약을 충족한 후 별도 적용합니다.
