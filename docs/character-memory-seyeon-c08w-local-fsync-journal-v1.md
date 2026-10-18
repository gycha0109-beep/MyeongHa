# C08-W — 로컬 fsync 선예약·충돌 방지 원장 (무과금)

Watchtower-Track: character-memory

## 목적·실제 범위

C08-V의 GitHub Actions 임시 JSONL 원장은 순차 모의 실행 전에 기록되지만, 강제 종료·동일 로컬 경로 재진입·예약 기록의 파일시스템 내구성에 대한 별도 테스트가 부족했습니다. C08-W는 기존 **C08-T 3 Gold × Original/Compact 6슬롯**을 유지하며, 오직 **무료 모의 실행**에 재사용 가능한 로컬 append-only 원장을 추가합니다.

- scripts/seyeon-cost-c08w-local-fsync-journal-v1.mjs: 신규 절대경로 디렉터리에만 입장(mkdir exclusive, mode 0700). 기존 디렉터리 재사용·심볼릭 링크·잘못된 소유자·잘못된 파일 권한·중복 파일·변경된 슬롯 순서 거절.
- 각 예약/관측은 슬롯별 별도 파일(mode 0600)을 O_CREAT|O_EXCL|O_NOFOLLOW로 처음 한 번만 쓰고, 파일과 디렉터리 엔트리까지 fsync 후 journal 호출을 반환합니다. 호출자가 기존 C08-V mock에 journal 함수를 주입할 때 **예약의 내구성 확인 이후에만** 해당 mock이 시작됩니다.
- 관측 불명·사용량 초과·journal 실패·모의 실행 도중 충돌은 다음 슬롯을 중단합니다. 읽기 전용 audit는 손상·누락·끼워 넣은 파일·불완전한 예약·UNKNOWN 관측을 성공으로 승격시키지 않습니다.
- Gold 원문·모델 출력·토큰 본문·키는 저장하지 않고, case/variant ID, 예약 추산액, 모의 사용량 비용 및 고정 상태만 보존합니다. 수치 19,662 microUSD / 보수적 약 KRW 49.155는 **최초 6회 유료 실행에 적용할 계획상 예약 상한**이며 청구 내역이 아닙니다.

## 강제 제한과 남은 의존성

**가장 중요한 제한:** GitHub Actions Runner 임시 파일시스템에 있는 이 원장은 **서로 다른 runner, 디렉터리, job, workflow_dispatch 사이의 전역 중복 호출을 차단하지 못합니다.** 다른 디렉터리를 만들면 새로운 *무료* 모의 실행을 시작할 수 있습니다. 이 코드는 실제 Provider POST를 하거나 영구적인 공급자 전역 예약 원장을 제공하지 않으며 유료 워크플로에 바로 이식해서는 안 됩니다.

- crossRunGlobalDurabilityVerified=false, providerHardLimitVerified=false, invoiceReconciled=false, paidDispatchEnabled=false, actualBilledKrw=null.
- 유료 실행에는 **독립된 장기 보존 공유 원장 / GitHub Actions 전체 실행 중복 검증 / 실제 provider 청구액 및 키 귀속·기존 11회 대조 / USD 1 Enforce hard limit 입증 / 별도 reviewed workflow**가 필요합니다.
- 추가 Owner 승인 누적 KRW 5,000은 유지되며, 이번 작업으로 실제 유료 호출하지 않습니다. 관측 6/72, 미측정 66/72, Production 및 G0~G6 HOLD.
- C08-V의 단발성 manual 워크플로는 그대로 유지합니다. 실제 유료 워크플로 dispatch·운영 모델·DB·ACL·Canon·결제 Secret·Vercel 배포 변경 없음.

## 검증

npx vitest run test/seyeon-cost-c08w-local-fsync-journal-v1.test.mjs test/seyeon-cost-c08v-offline-once-pilot-v1.test.mjs test/seyeon-cost-c08t-owner-budget-pilot-v1.test.mjs

필수: 변경 HEAD의 기본 CI·Governance, 통합 PG17 포함 Full Integration, 병합 후 최신 main 검증. 테스트 성공은 로컬 모의 입출력 내구성 계약만 입증합니다.
