# 여울 기존 질문·신규 8가족 의미 중복 사람 검토 v1

> 2026-11-14 · character-runtime-lab / GEPA 4단계 파일럿 준비 · 연구 전용 · 운영/유료 모델 송신 금지

## 범위와 개인정보 경계

- 기존 개발 평가 Y01~Y12(288건 원본 중 고유 질문 12개)와 신규 개발 4가족·최적화 검증 4가족의 **의미 중복 검토**만 다룬다.
- 기존 문자열 유사도 도구는 단순 어휘 겹침만 찾는다. 질문 주제·과제·의도·요구 추론이 같거나 실질적으로 같은 능력을 재는지는 사람이 직접 판단해야 한다.
- 검토 HTML은 실제 기존 12개 질문이 들어가므로 반드시 원본이 있는 승인된 PC의 **Git 저장소 밖 비공개 폴더**에만 생성한다. HTML을 GitHub, CI, 외부 모델에 업로드하지 않는다.
- 페이지는 파일 기반, 외부 스크립트·이미지·폰트·네트워크 호출 없음. 원본 질문은 HTML 텍스트로 이스케이프되어 실행되지 않는다.
- Y07 실패 6건 검토와 별도 30개 행동 규칙/대사 검토를 대신하지 않는다.

## 1. 오프라인 검토 화면 생성

저장소의 최신 main에서, 실제 존재하는 개인 폴더에 새 파일명으로 출력한다. 알려진 원본 36행·9그룹의 미검토 자동 필드는 명시적 옵션이 있을 때만 **메모리에서 복사 후 제외**하며 원본은 수정하지 않는다.

~~~sh
node scripts/character-optimization/yeoul-private-semantic-review-v1.mjs generate \
  --private-original /private/yeoul-evaluations-all-288.json \
  --private-html-output /private/yeoul-semantic-review.html \
  --known-original-unreviewed-auto-fields
~~~

이미 정제된 288행의 엄격한 자료라면 마지막 옵션 없이 실행한다. 288개 원본 조합과 Y01~Y12 질문 동일성, 신규 가족 8개 구성 검사 중 하나라도 실패하면 출력하지 않는다. 기존 파일은 절대 덮어쓰지 않는다.

## 2. 사람이 직접 판단

생성 HTML을 오프라인 브라우저에서 연다. 기존 Y01~Y12와 신규 8개 가족의 각 턴을 읽고 가족마다 하나를 선택한다.

- **미검토**: 초기 상태, 근거와 겹친 질문 ID를 비워둔다.
- **의미상 중복 없음**: 직접 검토한 판단 근거를 남긴다.
- **기존 질문과 의미 중복**: 근거와 Y01~Y12 중 관련 질문 ID를 하나 이상 남긴다.
- **판단 보류**: 무엇이 불확실한지 근거를 남긴다. 완료로 보지 않는다.

'검토 초안 JSON 저장'으로 로컬에만 저장하고 다시 불러올 수 있다. 브라우저 JSON에도 사람 자유 근거가 포함되므로 저장소 밖에 보관한다. 검토 초안에는 **현재 기존 12개 질문과 신규 8개 질문군의 내용에 연결된 로컬 전용 확인값**이 포함된다. 서로 다른 원본의 초안은 브라우저 불러오기 및 접수 단계에서 거부한다. 이전 버전의 확인값 없는 초안도 다시 생성해야 한다. 확인값은 검토자 인증이나 원본 진위 증명이 아니다.

## 3. 작성 결과의 원본 대조 접수

~~~sh
node scripts/character-optimization/yeoul-private-semantic-review-v1.mjs intake \
  --private-original /private/yeoul-evaluations-all-288.json \
  --review-draft /private/yeoul-semantic-review-draft.json \
  --private-result /private/yeoul-semantic-summary.json \
  --known-original-unreviewed-auto-fields
~~~

접수기는 원본을 다시 검사한 뒤 신규 8가족 순서·ID, 허용된 판정 1개, 중복 Y01~Y12 참조, 항목별 근거를 검증한다. 위조된 승인 상태, 추가 키, 근거 없는 판정, 중복·없는 참조, 원본/출력 덮어쓰기를 거부한다.

결과에는 **8개 가족의 미검토·중복 없음·중복·보류 개수와 중복 가족 ID만** 남긴다. 원래 질문/응답·자유 근거·원본 해시와 로컬 확인값을 집계 JSON에 넣지 않는다. 로컬 확인값은 초안과 재검사한 질문군의 정합성만 확인하며, 신뢰 가능한 원본 출처나 사람의 승인 권한을 증명하지 않는다.

## 상태와 후속 조건

사람이 8개 가족을 모두 판정해도 본 기능은 검토자 신원, 원본의 신뢰 가능한 독립 바이트 출처, 사람 평가의 질, 실제 신규 최종 홀드아웃 또는 독립 최적화 검증을 증명하지 않는다. 결과의 independentSemanticReviewVerified, optimizerInputAuthorized, ownerApprovalVerified, paidExecutionReady는 항상 false다.

실제 사람 검토의 결과와 사용자의 확인을 별도 근거로 수집한 후에만 데이터 분할 독립성 판정을 수행할 수 있다. 이 도구는 GEPA 평가 자료 승격을 자동 수행하지 않는다.

## 검사

~~~sh
node --test scripts/character-optimization/yeoul-private-semantic-review-v1.test.mjs
~~~

합성 288행/36·9 구조, 원본 불변, HTML 이스케이프 및 무네트워크, 8건 판정과 거짓 승인·근거·참조 위조 차단, 비공개 새 파일 생성/덮어쓰기 차단을 검증한다. 실제 사용자 자료 또는 유료 모델은 사용하지 않는다.
