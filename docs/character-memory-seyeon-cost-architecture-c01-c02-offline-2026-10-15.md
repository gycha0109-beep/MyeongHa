# COST-01/02: 세연 5회·3회·2회 후보 구조 재평가 및 무과금 안전성 실험

> Watchtower-Track: character-memory  
> 일자: 2026-10-15 KST · Draft PR #1985  
> **결론: 최적 구조 미확정. 기존 5→3 통합은 타당한 후보이나 최저 비용/최고 품질/실서비스 안정성의 증거가 없다.**  
> 범위: 코드 정적 검토 + 합성 100건 × 3종 라우팅 회귀, **AI 모델 호출 0**. Production Router/DB/Provider/Governor 변경 0.

## 1. 기존 실행 구조의 코드 경로 (source of truth)

| 구성요소 | 구현 근거 | 검증/한계 |
|---|---|---|
| 기존 5회: 두 분류를 병렬 실행 | `apps/api/src/character-governed-preflight-v1.ts`의 `Promise.all` + `apps/api/src/seyeon-character-runtime-v2.ts`의 Interpreter → Renderer → Semantic Reviewer | 5 API 호출 **= 5번 직렬 지연 아님**. 두 분류는 병렬이므로 비용/대기시간은 별도 측정 필요 |
| 실제 운영 5회 경로 | `apps/api/src/production-seyeon-chat-runtime-v1.ts`의 meteredPreflight/Interpreter/Renderer/Reviewer 바인딩 | 기본적으로 기존 5단계 구조, 각 Provider와 비용 Runner가 따로 관리됨 |
| 고정 3회 후보 | `apps/api/src/seyeon-unified-preflight-shadow-v1.ts`의 Luna 통합 Classifier 1회; `seyeon-unified-governance-candidate-v1.ts`가 분류 결과를 한 턴 안에서 재사용; `seyeon-fast-dialogue-shadow-v1.ts`가 Interpretation+Draft 1회, 별도 Semantic Reviewer 1회 | **Shadow 전용**. 서버 Integrity/Disclosure 권한 resolver는 유지하지만 **현재 Production에 연결되지 않음** |
| 독립 Reviewer | `seyeon-fast-dialogue-shadow-v1.ts`의 `buildSeyeonSemanticReviewRequestV2`, `guardSeyeonRendererOutputV2` | **우회·삭제 금지**. 단일 모델 생성 출력의 자체 평가만으로 비인가 기억 사용/캐릭터 품질 입증 불가 |
| 비용 및 호출 수 계측 | `apps/api/src/openai-seyeon-structured-provider-v1.ts`, `seyeon-ai-usage-cost-v1.ts` | Provider usage 수집 기능 존재. `maxOutputTokens`는 opt-in; cache hit은 별도 사전 보장이 아니라 측정해야 할 변수 |
| 모델 평가 | `scripts/run-seyeon-dialogue-path-real-api-eval-v1.mjs` + `scripts/seyeon-dialogue-path-eval-core-v1.mjs` | 합성 16건 runner는 존재, 유료 평가 워크플로는 현재 **비용 사고 if:false**로 BLOCKED |

**중요한 범위 차이:** 성공 시 5/3회란 **전면 대화 주요 모델 호출 수**이지, Post-turn 사건 추출, 공식 input-token counting, 실패 응답/모호한 재시도/미정산 Provider Event까지 포함한 *실제 세션 총비용*이 아니다. 비용 비교에는 후속 작업까지 별도 열을 둬야 한다.

## 2. 대안 간 엄격한 비교

| 평가 축 | 기준 5회 | 통합 3회 | 조건부 2회 후보 | 압축/캐시 3회 |
|---|---|---|---|---|
| 정상 전면 API 구조 | Terra 2 Classification + 1 Interpretation + 1 Renderer + 1 Review | Luna Unified + Terra Interpretation/Draft + Terra Review | **검증된 0-출처** Server Preflight로 분류 모델을 생략했다고 *가정*, Terra Interpretation/Draft + Review | 3회와 동일; Stable Prefix/JSON/Input 경량화만 후보 |
| 현재 지원 영역 | 기존 런타임 (실제 Product은 별도 HOLD) | 공개 첫 만남 Shadow | **실행 불가, 설계 후보** | 미구현/계측 계획 |
| 권한/근거 | 독립 Classifier + server resolver | 통합 Classifier + server resolver | 원본 Memory/History/Relationship가 없다는 Owner 권한 검증과 **동등한 사전 분류 증명 필요** | 3회 권한 흐름 불변 |
| 캐릭터 원인→대사 | Interpretation 검증 후 Renderer 생성 | Interpretation+Draft를 모델이 동시 생성, 서버가 사후 검사 | 3회와 동일 | 3회와 동일 |
| 불필요한 출력 가능성 | 해석 거부 시 Renderer 미호출 | 모델이 만든 Draft가 Guard 뒤에 폐기될 수 있음 | 동일, + 사전분류 생략 안전성 부담 | 동일 |
| 가격/속도 | 8건 제한 실측 | 8건 제한 실측, 21.8% 추정 저렴 | **없음, 추정 금지** | **없음, 캐시 효과 추정 금지** |
| 최종 판정 | REFERENCE | BEST TESTED CANDIDATE / HOLD | EXPERIMENT DESIGN ONLY / HOLD | EXPERIMENT DESIGN ONLY / HOLD |

**품질에 따라 경로를 동적으로 바꾸는 정책은 아직 적용할 수 없다.** 특히 “안전해 보이는 인사”를 신뢰할 수 없는 문자열 검사만으로 분류 모델을 생략하는 것은 위험하다. 2회 경로는 **DB Owner의 실제 원본 출처 0·대화/관계/History 무관·검증된 선행 안전 판정**과 런타임의 등가적 Admission이 추가로 승인된 이후에야 실행 가능. 이번 테스트의 `SYNTHETIC_OFFLINE_ONLY` evidence는 아무 호출자나 위조할 수 있으므로 절대 API 권한으로 사용하지 않는다.

## 3. 신규 무과금 구현과 테스트의 진짜 범위

- `scripts/seyeon-cost-architecture-offline-v1.mjs`: 모듈이 실제 모델 요청/Network를 수행할 수 없는 순수 비교기. 5/3/2 stage topology, **정확히 허용된 합성 공개 첫 만남 Fixture**만 3회/2회 실험 대상으로 표시. 그 외는 5회 **참조 표지**(모델 호출이 아님). 0 source/0 history/0 relationship 상태가 아닌 경우 **HOLD/0회**. 전체 결과는 Production 권한이 아니며 자동 활성화 불가.
- **2회 실험 대상은 N01, X01 2개 문장 정확 일치에만 한정.** 오타·공백·Unicode·추가 문자열이 있으면 최소 5회 참조 표지로 내려간다. Exact Fixture Matching은 자연어 위험 분류기가 아니며 Unknown 일반화 성능 0건이다.
- `test/seyeon-cost-architecture-offline-v1.test.mjs`: 기존 **골드 평가 100건 원형**에 각 입력의 공격 문자열 접미사 및 유니코드 변형을 추가한 300건 확인. 민감/과거공유·권한 우회 메시지는 2/3회 후보에 진입하지 않아야 하며, 변조 200건은 모두 5회 참조 표지. 출처/관계/History 증거가 1건이라도 생기면 HOLD.
- 완전한 Provider 단계별 사용량을 제공할 때만 **기존 저장소 가상 단가**로 조건부 비용 계산. 관측 누락·모델 불일치·이상한 토큰 수는 `UNKNOWN, estimatedUsd=null`; 실사용 청구액·캐시 절감·사용자 응답 품질 미검증.
- 기존 두 유료 평가 GitHub Actions `if: ${{ false }}` 유지 확인, Production runtime가 새 실험 스크립트를 import하지 않음을 정적 검사.

**핵심 한계:** “300건 라우팅 우회 0”은 **정확한 합성 문구 매칭의 정적 음성 결과**일 뿐 300건 실제 모델 분류 검출률도, Semantic Reviewer 신뢰도도, 인젝션 방어 성공도, 2회 구조 품질도 증명하지 않는다. 새 골드 300건을 평가했다는 주장을 하지 않는다.

## 4. 현재 검증된 비용과 미검증 영역

2026-10-09 v2 공개 첫 만남 합성 **8건** 실측:
- 기존 5: **$0.186241 / Guard 7·8 / P50 11,080ms / P95 16,468ms**
- 후보 3: **$0.145591 / Guard 8·8 / P50 11,179ms / P95 15,565ms**
- 비용 차이 약 **21.8% 절감**은 이 8건의 저장소 단가 기준 합계. **P50은 오히려 99ms 증가**하고 기준 Guard 1건 실패하므로 전체 동등성 PASS가 아님.
- v3 16건 실측 완료/결과 증거는 본 정적 작업에서 확인되지 않아 **UNVERIFIED**.
- 2회·캐시/압축 3회·후속 이벤트 추출의 **별도 실측값 없음**. 모델 전송을 허가하지 않은 상태에서 절감 금액이나 품질을 가정하면 안 됨.

## 5. 추천 진행 우선순위 및 종료 조건

1. **COST-01 (이번 단계)**: 소스 호출 그래프·Production 연결·비용 잠금·5/3/2/캐시 후보를 문서와 비가동 테스트로 정리. [통합 로드맵](ROADMAP.md)에 반영. 단순 코드 증거는 실제 사용자 사용성 보증이 아님.
2. **COST-02 (다음 단계)**: 현재 원형 100건 × 변형 3종은 라우팅 음성 검사로 유지하되, 별도 **최소 300개 고유한 안전·위험 평가 gold**에서 통합 분류/Resolver/Output Guard를 실제(우선 fake) 모델 출력 및 기대 라벨과 대조. 단순 동일문장 복제/규칙 매칭으로 임무 종료 선언하지 않음.
3. **COST-03**: 공개 첫 만남뿐 아니라 성격/취향, 반복 질의, 갈등/정서, 관계/공유 기억(Owner 승인된 합성), 10~30턴 누적·일관성 및 블라인드 캐릭터 평가 rubric 마련. 기준/후보 동일 문맥 사용.
4. **COST-04**: Provider body의 static prefix·repeated instruction/schema, prompt cache 실제 hit, output/reasoning token cap, 0-output/리뷰 거절 비용, post-turn 및 token-count overhead를 **stage별** 분리. 품질 실패에 따른 재호출/추가 비용 포함.
5. **COST-05 비용 사고/보안/DB Owner 승인 없이는 유료 실모델 비교·프로덕션 라우팅을 절대 시작하지 않음**. 우회 Workflow/모델 키/새 비용 경로 생성 금지. 승인 전 **3회·2회·압축 3회 모두 Production HOLD**.
6. **COST-06/07**: 비용/품질/권한/지연 비열등성을 확인한 경로만 승인된 제한 스테이징·롤백과 함께 검토. 현재 설계가 최적이라는 표현 금지.

**종료 표시:** CI Green은 COST-01/02 *정적 실험·코드 검증*만 닫는다. 비용 최적화 P0는 최종 캐릭터 품질·유료 예산 승인·실측·운영 전환 조건이 충족될 때까지 **HOLD**.
