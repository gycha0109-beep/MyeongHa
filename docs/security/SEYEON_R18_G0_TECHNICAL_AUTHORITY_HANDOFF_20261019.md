# 세연 R18 — G0 기술 승인·R17 운영 권한 적용 인수 문서 (2026-10-19)

> Watchtower-Track: security  
> **SOURCE PREPARED / G0 TECHNICAL SIGNOFF OPEN / PRODUCTION HOLD**  
> 이 문서는 실제 Owner의 기술 결정·운영 적용을 위한 인수 자료입니다. Product Owner의 제품 선택은 이미 [승인](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)됐으며 다시 묻지 않습니다. 문서 추가·CI 성공은 기술 서명, DB 적용, 서비스 공개 승인이 아닙니다.

## 1. 현재 증거와 경계

- R17 최소권한 비공개 Grant 철회 후보: [#2316](https://github.com/gycha0109-beep/MyeongHa/pull/2316), [Full Integration 11/11](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39142314457), squash `16671989f050ca13d071e4c3c2ab1aaa1bb5b027`, [사후 main CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39144195981) 성공.
- [R17 SQL](../../scripts/operations/seyeon-private-memory-grant-revoke-r17-candidate.sql)은 `supabase/migrations/` **밖에** 있으며, 폐기 가능한 격리 PG의 `myeongha_api_executor` 역할에서만 본인 Member/세연 Grant 철회·replay·타인 거부를 시험했습니다. **운영 DB 미설치**입니다.
- [R16 HTTP 후보](../../apps/api/src/seyeon-memory-grant-revoke-http-v1.ts)는 인증된 Member 본인의 Memory ID만 받고, [운영 구성](../../apps/api/src/production-seyeon-memory-grant-revoke-runtime-v1.ts)은 `publicRouteMounted:false`, `writeAdmission:'DENY'`이며, Vercel `api/me.ts` 경로에 **미탑재**입니다.
- R17 이전 운영 DB pg_catalog 실측에서 `myeongha_api_executor`는 기존 `public.cmd_revoke_memory_character_grant_v1` 실행권과 필요한 직접 테이블 쓰기 권한이 **없었습니다**. 이 사실은 R17 비공개 함수의 설치·승인을 뜻하지 않습니다.
- R18 [읽기 전용 카탈로그 SQL](../../scripts/operations/seyeon-private-revoke-r18-readonly.sql)은 **현재** 함수 존재/Owner/SECURITY DEFINER, Schema USAGE, 최소 EXECUTE, 직접 공개 역할·광범위 UPDATE/SELECT 허용 여부만 조회합니다. 미설치일 때는 `HOLD`이며, 모든 DB 플래그가 맞아도 **Owner 서명·HTTP/DR 증거를 대신하지 않습니다**. 스크립트 자체는 자동 Production workflow에 연결하지 않습니다.

## 2. 실제 기술 Owner별 미결정

| 책임 | 버전 있는 판정이 필요한 항목 | 합격의 근거 | 판정 전 |
| --- | --- | --- | --- |
| **Character / Source** | S0 직접 Memory **실제** `recordType/schemaVersion/projectorVersion` 1쌍; 최종 모델 입력과 Thread/Attempt·과거 대화/Relationship·Reader 파생 출처의 배제·계보 (D-01/02/08) | 버전·타입·정확한 모델 사용 집합과 누락 시 HOLD 시나리오 | Projector `[]`, G1 양수 HOLD |
| **DB Authority / Security** | original `recordId/grantId`, raw/projection digest·Codec, 재승인 시 기존 Attempt 재사용 금지, Subject→Grant 잠금 순서, 1640 zero/positive XOR, G1 모델 호출 전 DB 영속 Pin·G2 동일 트랜잭션 Commit (D-03/06/07/10) | 실제 Owner 함수, 최소 역할 ACL, 독립 PG 2세션 Commit↔Revoke 및 보존/재호출 | R17 운영 SQL·권한 적용 금지, G2 HOLD |
| **Security / API / DB** | `P/C/V/R/S/ACK` 송출·철회 순서, Node `finish`와 Vercel/Proxy/클라이언트의 차이, stale 버퍼·다중 인스턴스·장애 시 0바이트 차단, 비스트리밍, History/Replay/Worker (D-04/05/09) | 실제 신뢰 송신자·프록시 경계 + 독립 DB 취소 경쟁·송출 실패/timeout 증거 | 최초 양수 Reveal·과거 재공개 HOLD |
| **Ops / Production DB Authority** | 1520~1720 보류 이력, 원격-only version, R17 향후 forward-only 설치/되돌리기·DR·backup/restore (#1887) | 원격 history 안전 대조, 정확한 실행 SHA, 복원 digest·RPO/RTO 서명 | DDL/DML/ACL 변경 0 |
| **Integration Owner** | 검증된 기술·운영 범위 내 synthetic smoke, 예산/사고 중단, 공개 또는 유료 전환 | G0~G5 + DR 증거 및 별도 G6 승인 | public/paid OFF |

**S0는 아직 승인된 실 `recordType`을 갖지 않습니다.** 문서상 예시 타입이나 격리 fixture의 `shared_detail`을 운영 허용 목록으로 승격하지 않습니다. Owner 결정을 추측하거나 Product Owner 제품 정책의 재승인을 요구하지 않습니다.

## 3. 기술 계약 확정 전 기본 거부

1. **철회 정합성:** 서버 검증 Member→canonical Subject만 사용; 본인 Memory·고정 `seyeon`; 이전 Grant/Attempt의 소급 부활 금지. DB `COMMIT` 후에만 성공 ACK; COMMIT 응답 손실/lock timeout은 확정 성공으로 응답하지 않습니다.
2. **DB 역할 경계:** R17 비공개 Schema의 단일 RPC `EXECUTE`만 API executor에 허용하는 **후보**. `anon/authenticated/service_role`의 직접 사용, `public` legacy RPC 권한, 일반 Grant/Subject/Memory 테이블 SELECT/UPDATE 확대 금지. 원격 ACL 변경은 별도 승인된 유지보수 작업에서만 수행합니다.
3. **송출 충돌:** `V→R→ACK→S`(이전 권한 조회 후 철회 확정, 나중에 미송출 응답 전송)는 금지. R10~R13의 Node `finish` 선형화는 **실제 Vercel/Edge/Proxy 송신 보증 아님**. 신뢰 가능한 송신 펜스/철회 장벽이 증명되지 않으면 본문 0바이트/503 유지.
4. **과거 메시지:** 기억 활용 중지와 과거 대화 삭제는 별개지만, 기록 보존만으로 History·Replay·요약·Worker·Reader에서 개인기억 파생 문장을 다시 공개할 권한이 생기지 않습니다.
5. **순서:** 기술 승인 → 별도 Ops 권한의 안전한 DB 설치·ACL/DR 재확인 → 격리된 실제 DB/HTTP 검증 → G1 positive/G2/G3 실제 서비스 연결 → G5 → G6; 어느 중간 PR도 운영 자동 배포를 허용하지 않습니다.

## 4. 기록해야 할 실제 승인 산출물

각 결정마다 다음을 [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)에 남깁니다.

```text
결정 ID/버전: G0-D01...D10 또는 D-04
Owner 역할/실제 검토자:
판정: APPROVE | REVISE | OUT_OF_SCOPE+FAIL_CLOSED
대상: S0 실제 타입/원본 Grant/파생 lineage/송출 경계(해당 부분)
승인 전제: 정확한 HEAD SHA, 적용 대상 DB SHA/role·schema Owner
검증: disposable PG 권한·경합, HTTP/Proxy 취소·지연 송출 증거 링크
OPEN/HOLD 및 사고 시 응답:
검토 시각 및 승인 기록:
```

**미제출 항목은 OPEN**입니다. PR 작성자·AI·제품 승인자를 실제 Security/DB/API/Character 승인자로 표기하지 않습니다.

## 5. 바로 이어질 개발 범위

Owner가 아직 결정하지 않은 타입·Codec·송출 보장을 임의로 확정하지 않고, 격리에서 검증 가능한 기존 후보만 재사용합니다. 다음 실제 구현은 **S0 최종 모델 입력 집합의 original Grant/Record + 파생 출처의 모델 전 영속 Pin(G1)**이며, 이후 **동일 DB 트랜잭션 Commit(G2)** 및 **신뢰하는 HTTP/History/Replay 송출 경계(G3)**입니다. 검증은 기존 CI/Governance/Full Integration을 재사용하고 새 Workflow를 만들지 않습니다.

**유지 상태:** `G0=PROPOSED`, `G1 positive/G2/G3/G5/G6=HOLD`, `Projectors=[]`, `routeMounted=false`, `writeAdmission='DENY'`, Production DB writes=0, 실제 Provider/공개/유료 OFF.
