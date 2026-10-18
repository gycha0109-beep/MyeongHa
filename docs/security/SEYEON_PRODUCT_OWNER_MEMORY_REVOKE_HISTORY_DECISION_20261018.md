# 세연 개인기억·철회·과거대화 — Product Owner 선택 승인 (2026-10-18)

> Watchtower-Track: security
>
> **Decision state:** `PRODUCT_POLICY_APPROVED / G0_TECHNICAL_SIGNOFF_PENDING`
>
> **Source of approval:** 2026-10-18 제품 책임자 대화에서 외부 AI 서비스 비교 결과와 최종 단순 요약(기억 저장·공유 유지 / 철회 중 전송 처리 수정 / 과거 대화와 기억 삭제 분리 / DB 보안 유지 / 출시 검증 HOLD)에 대해 명시적으로 "승인"한 결정.
>
> **Authority boundary:** 본 결정은 Product Owner의 **제품 동작 및 위험 경계 선택**이다. Security/API/DB/Character의 기술 계약 서명, G0 APPROVED, G1~G6 PASS, Production DB 변경, Provider/공개/유료 활성화 승인이 아니다. 기존 2026-10-13 제품 방향 승인을 되묻지 않는다.
>
> Related: [세연 G0 기술 계약 후보](SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md), [완료 게이트](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [보안 실행 로드맵](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md), [증거 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

## 1. 승인된 제품 동작

| 항목 | 승인 결정 | 구현 시 반드시 지킬 경계 |
| --- | --- | --- |
| 기억 저장 | 사용자가 기억 저장 범위를 직접 고른다. 최초 양수 개인기억 허용 종류는 좁은 기술 검증 범위에서 순차 확장한다. | 기존 유스케이스의 `이 대화에서만 / 이 대리자만 기억 / 현재 대리자들에게 공유 / 기록하지 않기` 선택지를 유지한다. 자동 장기 기억 저장 금지. |
| 캐릭터 간 공유 | 세연만 기억할지, 명시적으로 지정된 다른 캐릭터에게 공유할지 사용자가 결정한다. | 서로 다른 Character에 암묵적 공유 금지. 원본 Record 및 개별 정확한 Grant에 묶는다. |
| 철회 효력 | 처리·확정된 철회 이후 해당 개인기억은 새로운 모델 입력, 검색, 요약, 캐시/Worker, 재시도 및 새로운 공개에 재사용하지 않는다. | 이전 조회나 오래된 캐시를 재허가로 간주 금지. 현재 원본 Grant·Record 권한 확인, 실패 시 HOLD. |
| 진행 중 답변 | 사용자가 철회할 때 **아직 송출하지 않은 보호 대상 응답**은 공개 차단하고, 진행 중 생성·전송은 중단을 시도한다. | 이미 실제 네트워크로 **송출된 바이트는 회수할 수 없으며, 철회 후 도착 가능**. 철회 완료(ACK)·송출 시점·in-flight 범위의 정확한 계약은 Security/API/DB가 따로 승인해야 하며, 증명 전 양수 Reveal은 계속 HOLD한다. |
| 스트리밍 | 개인기억을 활용한 AI 답변은 초기 출시 범위에서 **비스트리밍**을 기본으로 한다. | 비스트리밍은 철회 경합의 자동 해결이 아니다. 최초 HTTP 본문·Replay·Proxy의 송출 경계를 검증한다. |
| 과거 대화 | **기억의 미래 활용 중지**와 **과거 대화 기록의 보존·열람·삭제**를 구별한다. 철회만으로 사용자가 이미 작성하거나 수신한 모든 대화 기록을 일괄 삭제하지 않는다. | 기록 보존이 곧 재전송·AI 검색/요약·파생 정보 공개 권한은 아니다. 과거 개인기억 파생 Assistant 텍스트/Reader/Relationship/Replay는 현재 권한 및 provenance 검증 없으면 기존 HOLD를 유지한다. 별도 명시적 삭제 요청 및 법적 삭제 의무는 해당 범위대로 처리한다. |
| 재동의 | 같은 사실을 다시 허락하더라도 **새 Grant / 새 Attempt**부터 사용 가능하다. | 옛 철회 Grant나 옛 Attempt를 자동으로 되살려 공개하지 않는다. |
| DB 무결성 | 기존 exact Record/Grant/Schema/원본·투영 Digest, 모델 전 불변 Pin, 동일 DB 트랜잭션 Commit 검증, 최소권한을 유지한다. | 포맷·버전·잠금·ACL 선택은 DB/Security/Character 기술 담당자 소관이며 이 문서로 임의 확정하지 않는다. |
| 서비스 공개 | 실제 DB 두 독립 세션 + HTTP 경합/History·Replay/Worker + CI/Full Integration/운영 DR 검증 완료 후 별도 출시 승인. | `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`, 공개/유료 OFF, `authorizedForProduction=false`, `drReady=false`, Production DB writes=0 유지. |

## 2. 철회 시점의 안전 경계: 제품 승인과 기술 보장 구별

- **제품이 요구하는 결과**: 확정된 철회 이후에는 새로운 권한 사용과 보호 대상 미송출 답변의 공개를 막는다. 이미 네트워크에 인계한 바이트는 기술적으로 되찾는다고 약속하지 않는다.
- **아직 결정되지 않은 기술 계약**: `R`(철회 DB COMMIT), `V`(인가 검사), `S`(실제 송출), 철회 API 응답 `ACK`, 버퍼/프록시/실패/재시도 사이의 정확한 순서·차단 방식. 인가 확인 뒤 철회가 발생하고 그 이후에 버퍼 속 응답이 출발하는 `V→R→S` 경쟁은 승인 완료로 취급하면 안 된다.
- **안전한 진행 조건**: DB/Security/API는 철회 완료의 정의, 누가 어떤 시점에 송출하는지, 미송출 버퍼를 어떻게 무효화할지, 취소/전송이 경쟁할 때 사용자에게 어떤 결과를 보고할지를 버전 있는 계약으로 확정한다. 실제 Postgres+HTTP/Proxy 검증 전까지 양수 개인기억 기반 송출은 계속 차단한다.
- **비교 조사의 한계**: ChatGPT·Claude·Replika 등 외부 서비스의 공개 사용자 정책 및 Zanzibar/OpenFGA/SpiceDB의 권한 일관성 패턴은 참고 사례일 뿐, 외부 서비스의 미공개 DB 트랜잭션·네트워크 철회 구현과 동일하다고 주장하지 않는다.

## 3. 검증 및 승인 보류 항목

1. **Character/Source**: 최초 `recordType`, `schemaVersion`, `projectorVersion`, 배제 범위, 과거 파생 출처 lineage를 명시하고 실제 모델에 최종 포함된 목록에 결속.
2. **DB/Security**: original `recordId/grantId`, content digest 직렬화/위조 방지, 1640/후속 positive Pin, `cmd_commit_seyeon_chat_turn_runtime_v2` 단일 트랜잭션 잠금·ACL/회귀 검증.
3. **Security/API/DB**: 최초 Reveal/committed replay/History/Worker에서 현재 Grant와 파생 출처 검증; `R/V/S/ACK` 경계와 취소 중단·버퍼·프록시 송출 검증.
4. **QA/Ops/Integration**: 두 독립 PostgreSQL 세션, 실제 HTTP 송출 경합, 다중 사용자 격리, DR 및 운영 승인 G5/G6. 기존 운영 migration history 임의 repair 및 미승인 적용 금지.

**상태 판정**: `PRODUCT_POLICY_APPROVED`만 승인. `G0=PROPOSED`, `G1 positive/G2/G3/G5/G6=HOLD`, positive projector `[]`, public/paid OFF, Production DB writes=0. 기술 Owner 승인·실제 테스트가 없으면 단계 승격 금지.
