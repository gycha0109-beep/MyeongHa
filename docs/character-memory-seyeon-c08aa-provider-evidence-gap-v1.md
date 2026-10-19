# C08-AA — 유료 검증에 필요한 외부 증빙 누락 진단 (무과금)

Watchtower-Track: character-memory

## 실제 구현

외부 증빙이 전혀 없는 상태에서 "준비 완료"로 잘못 표시하는 위험을 줄이기 위한 **스키마 완결성 점검기**입니다. C08-T의 유료 차단은 절대 해제하지 않습니다.

- 과거 11회 실제 청구 대조, 평가 프로젝트와 Secret 귀속, 이달 공급자 실사용액, 월 USD 1 Enforce hard limit, 공유 원장 소유권·수정 삭제 방어의 다섯 증빙 종류를 각각 검사합니다.
- API 비밀키·원본 인보이스·Project ID를 로그/결과에 반환하지 않습니다. 값 형식과 미제출 필드 이름만 보고하며, 알 수 없는 추가 필드·비정상 숫자·Secret 형태 텍스트를 거부합니다.
- 모든 필드를 제출해도 이것은 **자가 제출한 참조값의 형식 검사**입니다. 공급자 계정의 독립적인 실증이 아니므로 언제나 `PAID_DISPATCH_HOLD`, `paidDispatchEnabled=false`, `actualBilledKrw=null`.
- C08-Y의 실제 폐기형 PG17 두 연결 검증과 진행 중인 C08-Z의 관리자 고정 Admission은 로컬 기술계약입니다. 운영 공유 원장의 변경/삭제 방지와 실제 공급자 hard cap을 보증하지 않습니다.
- 추가 승인된 5,000원 예산은 유지합니다. Gold 실모델 신규 실행 0회, 실제 관측 6/72, 나머지 66 미관측. Production/G0~G6, 운영 키/DB/ACL/결제/Canon/모델 호출 변경 없음.

## 남은 외부 조치

권한 있는 관리자가 실제 공급자 Billing/Usage, 11회의 청구 연계, 평가 프로젝트 키 귀속, 제한 설정과 이번 달 사용액을 **원문에 접근 가능한 안전한 감사 위치에서** 확인해야 합니다. 보안정보를 PR·채팅에 복사하지 않습니다. 공유 원장에 대해서는 실제 운영에서의 owner/ACL/삭제·변경 차단 증명이 추가로 필요합니다. 증빙을 독립 검증한 이후에도 별도의 Reviewed 유료 실행 PR을 필요로 합니다.

검증: `npx vitest run test/seyeon-cost-c08aa-provider-evidence-gap-v1.test.mjs test/seyeon-cost-c08t-owner-budget-pilot-v1.test.mjs`. 정확 PR HEAD CI·Governance·PG17 Full Integration·병합 후 최신 main 성공을 기술적 완료 조건으로 합니다.
