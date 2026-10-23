# C08-X — GitHub 원격 참조 기반 단발성 예약 충돌·불명 결과 모의 검증

Watchtower-Track: character-memory

## 새로 구현한 경계

C08-W의 로컬 fsync 원장은 **runner간 공유되지 않음**을 그대로 인정합니다. 이 후보는 GitHub REST `POST /repos/{owner}/{repo}/git/refs`의 create-once 참조 생성/이름 충돌을 **두 독립 실행자가 공유하는 가짜 원격 저장소**로 시뮬레이션합니다.

- `scripts/seyeon-cost-c08x-cross-run-github-ref-offline-v1.mjs`에는 **실제 API 통신 코드가 없습니다.** 외부 네트워크 전송 객체를 전달해도 거부하는 전용 fake-store 브랜드로 모의 실행 경계를 고정합니다. GitHub Contents write 권한·API 토큰·OpenAI 키·실제 원격 refs를 사용하지 않습니다.
- 첫 배치 식별자를 고정하여 `refs/heads/seyeon-c08x-offline-first-six-v1/batch` 한 개를 원격 시뮬레이터에 단발 생성합니다. 서로 다른 실행이 같은 ref를 동시에 생성하려고 하면 가짜 저장소에서 하나만 성공하고 나머지는 실패합니다. 이어 6개 Gold 슬롯당 하나의 별도 생성 ref를 예약합니다.
- GitHub를 모방한 생성 응답은 HTTP 201 / 정확 ref·commit SHA 형태만 인정하고, 읽기 재검증이 같은 SHA를 반환해야 다음 **모의 Provider**를 호출합니다. 409/422·인증 실패·타임아웃·응답 불명·생성 성공 후 ACK 손실은 무조건 HOLD, **재시도 0회**.
- 각 슬롯 관측 전에 첫 배치 및 모든 이전 예약의 ref를 다시 확인합니다. 중간 참조 수정/삭제가 보이면 다음 호출이 차단됩니다. 관측 불명/원장 손실도 동일하며 Gold·토큰 본문·비밀키를 어떤 원격 참조에도 적재하지 않습니다.
- 기존 C08-V의 6개 정해진 슬롯과 C08-T 5,000 KRW 추가 예산 / 19,662 microUSD 보수적 첫 예약은 그대로 소비합니다. 실모델 품질 관측 6/72와 무관한 **synthetic mock**입니다.

## 증명하지 않은 것: 강한 HOLD

GitHub 공식 REST 문서상 Git ref는 생성 후 **수정·삭제할 수 있습니다**. 따라서 충돌 거부와 읽기 재확인만으로 불변 원장, 관리자의 강제 삭제 차단, 운영자/워크플로 간 권한 분리 또는 절대 과금 상한을 보장할 수 없습니다.

- 이 단계에서는 실제 GitHub에 원격 참조를 생성하거나 Contents write 권한이 있는 워크플로를 배치하지 않습니다. 두-실행 경쟁 성공은 **메모리 내 Fake 저장소 동작**에 대한 증거이며 실제 GitHub race 검증이 아닙니다.
- 예약 참조는 실제로 삭제·변경될 수 있으므로 향후 실제 사용 전에 보호 규칙(rulesets/permissions), 감사 가능한 외부 공유 원장, 예상 운영 주체, 무결성·복구 정책을 별도 검증해야 합니다.
- 실모델 호출은 0회 추가, `globalCrossRunReservationVerified=false`, `providerHardLimitVerified=false`, `invoiceReconciled=false`, `actualBilledKrw=null`, `paidDispatchEnabled=false`. 공급자 이번 달 사용액·전용 키 귀속·기존 11회 청구대조와 독립 USD 1 하드캡 확인도 미완료입니다.
- Production/G0–G6, 실제 사용자 DB/개인정보/ACL/Canon, 운영 키와 유료 워크플로에는 변경이 없습니다.

## 재현 및 CI 판정

`npx vitest run test/seyeon-cost-c08x-cross-run-github-ref-offline-v1.test.mjs test/seyeon-cost-c08w-local-fsync-journal-v1.test.mjs test/seyeon-cost-c08v-offline-once-pilot-v1.test.mjs`

정확 HEAD CI·Governance·PG17 포함 Full Integration 성공 및 squash 병합 후 main 검증이 완료되기 전에는 완료 판정하지 않습니다.

공식 REST 근거: https://docs.github.com/en/rest/git/refs
