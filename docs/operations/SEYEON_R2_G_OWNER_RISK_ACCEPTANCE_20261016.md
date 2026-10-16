# 세연 R2-G — 과거 실행자 추적 종료 및 위험 수용 결정 (2026-10-16)

Watchtower-Track: ops

## 결정

**R2-G의 과거 SQL 실행자·관리 API 요청 ID·당시 COMMIT 로그 추가 추적 요구는 사용자 명시 지시에 따라 개발 차단 조건에서 해제한다.**

- 결정: `R2_G_HISTORICAL_PROVENANCE_AUDIT = CLOSED_RISK_ACCEPTED`
- 개발 게이트: `R2_G_HISTORICAL_ACTOR_BLOCKS_DEVELOPMENT = false`
- 근거: 사용자의 직접 지시(2026-10-16) — 과거 실행자 추적을 종료하고 진행하라는 요청. **실행자를 본인이었다고 인증한 진술이나 과거 실행 서명으로 취급하지 않는다.**
- 이 문서는 당시 로그를 새로 발견했다고 주장하거나, 복구 SQL 원문을 공개 저장소로 복사하지 않는다.

## 확인된 사실과 남는 불확실성

- Production 원격 이력 `20261008090417`: `seyeon_runtime_1460_1510_acl_before_owner_recovery`, **104,021 bytes**, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`.
- SQL 원문이 직접 `1460`~`1510` 6개 버전을 `supabase_migrations.schema_migrations`에 기록하는 구문을 포함한다. 현재 운영 이력의 해당 6개는 원문 저장 없이 존재한다.
- SQL이 정의한 함수 **19/19** 및 정책 이름 **19/19**가 현재 Production 카탈로그에 존재한다. 이는 **전체 SQL 함수 본문·Owner·ACL·RLS·의존성의 정합성 증명은 아니다.**
- 관리 API 세션 기록과 시간은 부합하지만, 실제 인증된 실행자·승인 시점·성공 COMMIT 로그는 확보하지 못했다. 본 결정은 **그 미확정 사항을 잔여 위험으로 수용**하는 것이며 `originEstablished=true`를 의미하지 않는다.

## 범위와 잔여 검증의 재분류

- **닫힘:** R2-G 과거 *사람/세션* 출처 추적을 반복하는 조사 작업. 이후 동일한 로그의 부재만을 이유로 테스트·PR·개발을 막지 않는다.
- **별도 기술 검증으로 유지:** 현 운영 스키마와 저장소의 객체·권한·함수 본문 정합성 및 순차 적용 안전성은 R2/R2-H 검증에서 처리한다. 복구 시점의 신원·감사 로그를 새로 요구하지 않는다.
- **별도 운영 결정으로 유지:** 현재 `1520`~`1720` **21개 마이그레이션은 미적용**. 명시적인 배포 범위/롤백/백업·복구 검증 전에는 Production에 적용하지 않는다.
- **변경 금지:** Production `migration repair`, 원격 SQL 재실행, Role/ACL/DDL/DML 임의 수정, 유료 AI·공개 Reader·G0~G6 활성화.
- 전체 시스템 `authorizedForProduction=false`, `drReady=false`, `paidAi=false`, `publicReader=false` 유지. **위험 수용이 운영 배포나 DR GREEN의 권한 부여로 자동 승격되지 않는다.**
- 본 결정 시점 **Production 쓰기 0건**. 원격 이력 자체는 그대로 보존한다.

## 실행 기록

- [Owner 결정 / 위험 수용 Issue #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887#issuecomment-6209233423)
- [복구 SQL 정체·19개 함수·6개 이력 증거](https://github.com/gycha0109-beep/MyeongHa/issues/1887#issuecomment-6208723205)
- [포렌식 조사 마감 / 미확정 명시](https://github.com/gycha0109-beep/MyeongHa/issues/1887#issuecomment-6208925482)
- [읽기 전용 기존 감사](SEYEON_R2_G_HISTORICAL_MANAGEMENT_API_LOG_AUDIT_20261016.md)

이 결정이 과거의 조사 문서에 기록된 '당시 HOLD' 이력 자체를 변경하지는 않는다. **이후 개발 현황에는 `CLOSED_RISK_ACCEPTED`를 사용한다.** 남은 검증·운영 결정은 각자의 독립된 게이트로 평가한다.
