# 여울 비공개 독립 최종평가 자료 사전 접수 v1

> 2026-11-14 · 4단계 준비 · 실제 새 봉인 평가셋 없음 · 유료 호출 0회

## 목적과 경계

승인된 아키텍처의 새 비공개 독립 홀드아웃 확보 요건을 위한 **로컬 초안 접수기**다. 질문 생성·인간 승인·실제 품질 평가를 하지 않는다. 기존 Y01~Y12 288건은 개발 자료이고 공개 H01~H10 및 신규 개발/최적화 검증 8가족도 신규 최종 봉인 평가가 아니다. 현재 Python 봉인 평가 실행기는 합성 자료 전용이며 이 접수기가 실측 평가기로 바꾸지 않는다.

비공개 새 질문 원문은 Git 저장소 밖의 개인 폴더에서만 작성·보관한다. 예시의 플레이스홀더는 실제 평가자료가 아니다.

~~~json
{
  "schemaVersion": "yeoul-private-holdout-draft-v1",
  "characterId": "yeoul",
  "datasetRole": "sealed_holdout",
  "sourceClass": "owner_new_unexposed_unverified",
  "families": [
    {
      "familyId": "private-sealed-scenario-one",
      "relationshipStage": "no_history",
      "historyAvailable": false,
      "turns": ["<사람이 비공개 환경에서 직접 작성한 새로운 평가 질문>"]
    }
  ]
}
~~~

가족 ID는 private-sealed- 접두사를 가진 ASCII 식별자, 한 가족은 1~3개 턴을 가진다. 실제 최종 표본 수·성공/중단 기준은 사용자가 별도로 정하며 이 도구가 임의 승인하지 않는다.

## 실행

실제 새 초안이 존재하는 PC에서만 실행한다.

~~~sh
node scripts/character-optimization/yeoul-private-holdout-preflight-v1.mjs --private-draft /private/new-sealed-draft.json --private-summary /private/new-sealed-summary.json
~~~

과거 288건 원본도 같은 개인 PC에서 사용 가능하면 선택적 중복 의심 검사에 포함한다.

~~~sh
node scripts/character-optimization/yeoul-private-holdout-preflight-v1.mjs --private-draft /private/new-sealed-draft.json --private-summary /private/new-sealed-summary-next.json --private-original /private/yeoul-evaluations-all-288.json --known-original-unreviewed-auto-fields
~~~

마지막 옵션은 알려진 원본 36행·9그룹의 미검토 자동 평가 필드만 메모리에서 제외할 때 사용한다. 원본이 없으면 Y01~Y12와의 비교도 완료되지 않는다.

## 검사·보존

- 공개 H01~H10 및 개발·최적화 검증 8가족의 정확한 문장 재사용을 거부한다. 정규화 문자 2-gram 유사도 0.65 이상과 신규 가족 간 유사도는 의심 **건수만** 표시한다. 문장이 다르다고 의미적 독립성을 증명하지 않는다.
- 입력 형식·중복 가족·추가 권한 주장·비정상 크기·심볼릭 링크·저장소 내 입출력·기존 파일 덮어쓰기를 거부한다. Linux/macOS 폴더 0700/입력과 출력 0600, Windows는 접근 제한된 개인 폴더를 사용해야 한다.
- 집계는 가족/턴 수와 의심 건수뿐이다. 개인 원문·원본 해시·자유 의견·가족별 문장/식별자는 결과에 포함하지 않는다.
- 출력은 항상 holdoutAdmitted=false, blindEvaluatorReady=false, independentSemanticReviewVerified=false, ownerApprovalVerified=false, paidExecutionReady=false, externalCalls=0이다.
- 추후 새 질문군의 의미적 독립성·출처 및 비공개 접근 격리·사람 블라인드 검토·모델/가격/승인 경계를 별도로 충족해야 한다. 500원 전체 한도와 실제 송신 금지는 유지한다.

로컬 합성 테스트: node --test scripts/character-optimization/yeoul-private-holdout-preflight-v1.test.mjs
