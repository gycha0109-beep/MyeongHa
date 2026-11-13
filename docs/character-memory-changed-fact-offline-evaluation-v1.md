# 장기기억 사실 변경·정정·유효기간 평가 v1 (오프라인)

Watchtower-Track: character-memory

**상태: 독립 가상 사실 원본 기반의 시간적 회상 검증 구현 / 실제 사용자 기억·모델 응답 평가 미구현**

## 기존 로드맵과 연결

장기기억 Phase 7에 이미 정의된 **시간적 정확성, 변경된 사실, 모순·승계 관계 평가**의 오프라인 부분 작업입니다. 기존 Phase 3 검색은 유효기간·권한·철회 조건에 따라 검색 결과를 걸러냅니다. 하지만 실제 모델이 이전 사실을 고집하는지, 수정된 사실로 잘못 대체하는지에 대한 **의미적 답변 평가**는 아직 별도 작업입니다.

이번 구현은 기존 검색 결과와 **독립적으로 고정한 가상 Life Fact 원본**을 대조합니다. 검색기가 반환한 텍스트 자체 또는 AI의 주장만으로 사실 변경을 확정하지 않습니다.

## 구현

- `packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.ts`

2026-11-13 source-fidelity check: selected Life Fact retrieval must retain original `sourceKind` and `granteeCharacterId` from independent source gold and must retain the `fact` classification. Matching record/grant IDs and time fields alone does not prove provenance. No report private content or Production right is added.
- `test/character-memory-changed-fact-offline-evaluation-v1.test.ts`

원본에는 Subject·Character, Fact/Grant 식별자, 주제, 원문을 대신하는 가상 값의 요약 해시, 생성·확정·권한 부여·유효 시작/종료·철회 시점, 그리고 **독립적으로 확인된 선행 사실 참조**를 고정합니다. 평가 시각은 실제 검색기가 생성한 값이 아니라 독립적으로 주어진 가상 사용자 발화 시점입니다.

검증 규칙은 다음과 같습니다.

1. 생성·확정·권한 부여·유효 시작이 해당 발화 이후이면 아직 활용 가능한 사실이 아닙니다.
2. 유효기간이 지났거나 철회된 사실은 현재 사실로 취급하지 않습니다.
3. 정정 사실은 **동일 주제의 이전 사실에 대한 명시적 승계 연결**, 앞뒤 확정 시점, 겹치지 않는 유효기간이 모두 검증되어야 합니다.
4. 동일 주제에 서로 다른 두 현재 사실이 동시에 존재하면 최신 텍스트를 임의 선택하지 않고 검사에 실패합니다.
5. 검색 결과에서 과거의 대체된 사실이 반환되거나 필수 현재 사실이 누락되면 검사에 실패합니다.
6. 다른 Subject·Character·Grant와 연결되거나 동일 출처가 중복 반환되면 검사에 실패합니다.

반환값에는 **통과 여부·건수·분야별 불리언만** 포함하며 개인 사실 내용, 출처 ID, 원본 대화, 키와 계정 정보를 포함하지 않습니다.

## 검증 근거와 제한

가상 사실의 변경 전/후, 아직 확정되지 않은 사실, 겹치는 모순, 유효기간 또는 승계 오류, 철회, 소유자·권한 불일치, 검색 중복, 관련 없는 질의 등을 검증합니다.

**이 평가는 기존 검색 결과의 출처 적격성에 한정됩니다.** 실제 대화에서 사용자가 정정 의도를 표현했는지 자동 판별하지 않으며, Life Fact나 Memory를 저장·승계·삭제하지 않습니다. 별도 답변 의미 평가나 캐릭터 일관성 평가를 완료했다고 주장하지 않습니다. 모델 호출, 개인 데이터 접근, 운영 DB 변경, 자동 기억 저장 및 공개 기능 활성화는 모두 없습니다.

독립 가상 원본만으로 얻은 통과는 실제 모델의 거짓 회상률, 실사용 장기기억 품질, 승인된 지식 출처, Production 배포 가능성을 입증하지 않습니다.

유료 평가 C08-T의 기존 **추가 누적 5,000원 / 첫 배치 6회** 한도, 11건 과거 청구 미확인, 승인·비용 보호 미검증, PR #3068 Draft 및 운영 차단 상태는 변경하지 않습니다. `ROADMAP_IN_PROGRESS`.

## 최종 오프라인 검증

추가 보강: 평가 기준 시각은 검색기의 정확한 가상 사용자 발화 시각과 일치해야 하고, 사실 기록보다 먼저 생성된 권한 또는 권한 부여 전 철회는 허용하지 않습니다. 철회가 없는 정상 사실을 잘못 제외하던 조건식도 수정했습니다.

`npx vitest run test/character-memory-changed-fact-offline-evaluation-v1.test.ts test/character-memory-retrieval-v1.test.ts test/character-memory-integrated-offline-real-v1.test.ts` — **33/33 PASS**. 실제 대화·유료 모델 평가·운영 데이터 접근은 하지 않았습니다.
