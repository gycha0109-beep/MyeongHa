# 세연 C08 로컬 사전 검증 → LLM 대사 1회 → 로컬 사후 검증 (V1)

Watchtower-Track: character-memory

## 실제 변경 / 범위

- 신규 Shadow 코드: `apps/api/src/seyeon-c08-local-one-call-shadow-v1.ts`
- 신규 서버 공식 이력 어댑터: `apps/api/src/seyeon-c08-local-thread-integrity-port-v1.ts`
- 신규 회귀: `test/seyeon-c08-local-one-call-shadow-offline-v1.test.ts`
- 기존 `runSeyeonCensusFirstThreeCallShadowV1`, Production, Reader, DB, Canon, 개인 Memory, 관계·Grant, 결제 코드는 **수정하지 않는다**. 기존 3회 경로로 롤백 가능하다.
- 이 구현은 **별도 opt-in 함수**로 호출하는 연구용 Shadow이다. 안전 동등성·정식 응답 라우팅·Production 공개 승인을 제공하지 않는다.
- 기존 `SeyeonDialogueEnvelopeV2`를 반환하지 않는다. 독립 LLM 검토를 했다고 속이는 `failureCodes:[]` 또는 임의 `semanticReviewHash`를 생성하지 않는다.

## 호출 구조

1. **사전 로컬 검증, LLM 0회**: 서버 제공 현재 메시지/과거 모든 메시지, 공개 첫 만남, 무관계·무기억, 단일 최신 user turn, 전체 authoritative Census(첫 턴) 또는 권한 있는 저장소의 완전한 대화 내용·순서 SHA-256 commitment(다중 턴) 일치를 검사. 메시지 수만 같으면 통과하는 허점은 허용하지 않는다. 현재 입력과 이전 user 입력은 닫힌 문장 문법(인사·대화 시작·가벼운 상태·속도·현재 선호·대화 경계·일상 잡담/농담·현재 영화 선택)에 해당해야 한다. 이전 assistant 문장도 보수적 로컬 공개 Guard를 통과해야 한다. 미확인 의미는 `LOCAL_INPUT_NOT_PROVEN`/`LOCAL_CONTEXT_NOT_PROVEN`으로 거부한다.
2. **기존 서버 권한 엔진 재사용**: 분류를 생략하지 않고 로컬이 실제로 증명할 수 있는 닫힌 문법에만 `claims=[]` / `topicKey=null`을 적용한다. 기존 `runCharacterGovernedPreflightV1`·`assembleSeyeonRuntimeContextV2`·`guardSeyeonTurnInterpretationV2`·`guardSeyeonRiskBearingActionCausalityV1`·`buildSeyeonRendererPacketV2` 유지. 개인정보 Source Descriptor, 사실 Resolver 및 Retriever 실행 금지.
3. **대사 생성, LLM 정확히 1회**: 서버가 현재 user move와 공용 reveal/행동 범위를 고정하고 기존 `buildSeyeonRendererRequestV2`를 사용한다. 임의 Memory/관계/사생활을 만들지 말도록 한 공개 첫 만남 지침을 추가. 기존 지시문 `baseline`을 기본값으로 보존하고, 별도 실험용 `compact_v1`은 지시문만 축약하며 출력 스키마·Guard·packet은 그대로 유지한다. 가격 예약 검증과 출력 토큰 상한 확인이 없으면 호출 전 거부. 예약 한도는 최대 4,000 microUSD ≈ 10 KRW(가정 환율 2,500). 이는 청구서 하드캡 증거가 아니다.
4. **사후 로컬 검증, LLM 0회**: 기존 `admitSeyeonRendererDraftV2`로 스키마/출처 참조/표현/공개 단계 검증. 보수적인 공개 문장·허위 기억/관계/고정 전기/사적 사실/관리자 문구 검출과 입력 의도별 대사 필수 조건 검사. 내용 검증 실패 시 대사 **미반환**, 재생성·추가 LLM 호출·자동 fallback 없음. 결과는 `localGuardedDraft`, `verification=LOCAL_RESTRICTED_NOT_SEMANTIC_PARITY`로만 보고.
5. **경합 검사**: 모델 이전·이후 등 4회 authoritative 재검사를 유지한다. 첫 턴은 기존 7필드 Census 조회 4회, 여러 턴은 `readAuthoritativeThreadCommitment`로 count/role/전체 ID·role·본문 해시를 **각 체크포인트당 단일 서버 조회**로 검증한다. 1~7개 전체 메시지와 최신 user ID/송신자 일치가 필요하다. `createSeyeonC08LocalThreadIntegrityPortV1`은 서버 저장소의 완전한 메시지 조회 포트를 받아 순서·본문 digest와 count를 한 번에 구성하며, 출력 전에 불변 복사본으로 고정한다. 단일 서버 조회에서 해당 count/hash가 같이 산출되지 않으면 거부한다. Census는 DB snapshot/commit lock이 아니며 마지막 검사 직후 레이스를 없애지 못한다.

## 호출 전 경로 판정

- `assessSeyeonC08LocalOneCallRouteV1`: 모델 호출·private Source 조회 없이 동일한 입력 문법과 공식 이력 검사로 `ONE_CALL_SHADOW_CANDIDATE` 또는 `RETAIN_THREE_CALL_BASELINE`을 반환한다.
- `RETAIN_THREE_CALL_BASELINE`는 호출자가 기존 검증 경로를 유지해야 한다는 **계획 신호**일 뿐, 추가 유료 호출이나 자동 재시도 승인이 아니다. 적격으로 판정되어도 뒤의 모든 재검사/비용 예약/로컬 출력검증을 통과해야 연구용 localGuardedDraft를 얻는다.
- 저장소 어댑터의 `readCompleteServerThread` 구현은 인증된 사용자·스레드 범위에서 **트랜잭션으로 일관된 전체 기록**을 읽어야 한다. 현재 기본 브랜치의 Production DB와 연결하지 않았다.

## 우선 구현 범위 및 한계

- **허용**: 기존 3회 기본 경로와 분리된 공개·무기억·무관계 대화, 메시지 1~7개 전체를 authoritative census와 비교할 수 있는 경우만.
- **보류**: 개인 관계·기억·친밀한 표현, 민감 가족/연애/상처, 공유 과거, 권한 사칭, 안전 동등성이 검증되지 않은 자유형 문장, 전체 Thread 확인 불가, 장기 대화/실제 서비스 라우팅. 예상치 못한 메시지는 기존 경로로 **상위 호출자가 명시적으로 분기**해야 한다(자동 모델 fallback 없음).
- 자연어 정규식은 독립 의미 검토의 범용 대체품이 아니다. 인정 범위를 좁혀 연구 후보로 사용한다. 민감 표현을 변형하거나 은유하면 검사가 누락될 위험이 있으므로 **사용자 대상 배포는 HOLD**.
- 오프라인 테스트의 mock Provider는 실제 지연·비용·캐릭터성·안전 동등성·ZDR·invoice hard cap 증거가 아니다. 실모델 비교는 이번 브랜치에서 수행하지 않는다.

## 검증

- 적격 입력 예시와 C07 원본 Gold 36개에 대한 기본 경로 검사. N01/N02만 닫힌 문법에 적격하며 나머지는 호출 전 HOLD.
- 부적격 사용자 주장·민감 정보·관리자/관계 사칭, 가짜 assistant 과거, 같은 메시지 수에서 본문/순서 변경, 저장소 commitment 누락·불일치·경합, 이력 누락/중복, Census 경합, 원장 예약 초과, 출력 JSON/출처 위반 및 대사 행동 불일치: 모델 호출 횟수와 공개 반환 여부 검사.
- 검증이 모두 통과한 뒤에야 별도로 안전 임계값·실모델 p50/p95·한국어 캐릭터성 비교를 준비한다. 유료 호출/Production 승격은 별도 증거와 승인이 필요하다.

## 로컬 계약 및 완료 조건

- `hashSeyeonC08PublicTranscriptV1(messages)`는 `[messageId,role,text]` 순서를 길이 구분해 해시한다. 다중 턴의 비교 값은 반드시 **서버의 완전한 공식 이력 조회**에서 생성해야 한다. 클라이언트가 제공한 hash/확인 표시는 권한 증거가 아니다.
- `readAuthoritativeThreadCommitment`는 `{schemaVersion:'seyeon-c08-public-thread-commitment-v1',subjectId,threadId,currentUserMessageId,messageCount,latestSenderType:'user',complete:true,transcriptHash}` 8필드만 반환한다. 누락·누적 이력 절단·해시 오염 시 0회 또는 1회 호출 후 HOLD. 각각의 체크포인트는 원자적 snapshot을 읽어야 한다.
- `compact_v1`은 프롬프트 길이의 연구 후보일 뿐, 블라인드 대사 품질·Gold 의미 동등성·속도/비용 달성을 입증하지 않는다. 실모델 유료 호출은 하지 않는다.
- 1회 연구 경로를 앱에 연결하거나 적격 범위를 자유형 대화/Memory/관계 단계까지 확대하려면 서버 출처 검증·권한·캐릭터 성능의 별도 근거가 필요하다.

## C08 공개 관계 단계 확장 (연구 Shadow)

- 공개 입력 문법과 전체 대화 원본 확인을 유지하는 경우에만 `contextInput.relationship`이 있어도 생성 후보가 될 수 있다.
- 관계 정보는 `requireSeyeonC08PublicRelationshipProofV1`과 `createSeyeonC08ServerRelationshipProofPortV1`로 인증된 저장소의 `stageKey/closenessBand/trustBand/frictionBand/revision/policyVersion`와 정확히 비교한다. 각 턴에서 원본 Census 검사와 함께 4회 재확인한다. Stage/Revision 불일치, 철회, 타인 소유자의 자료, 사적 공개 허용 데이터는 즉시 HOLD.
- 관계 Stage는 **현재 말투·응대 깊이 조절에만 사용**하고, 과거 공동 사건·관계 신분 주장·친밀감 상승·개인 기억·비공개 사연 공개의 근거가 되지 않는다. Interpretation의 Reveal은 여전히 PUBLIC, risk-bearing action 미사용, private descriptor 조회 0, AI 대사 1회다.
- 기존 Production 관계 포트에 직접 연결되지 않았으며 인증·트랜잭션을 보장하는 DB 포트를 추후 호출자가 제공해야 한다. 이 기능의 오프라인 적격성 검사는 사용자 대상 Production 전환 근거가 아니다.

## 기억 출처 검증 계약 (대사 연결 전 단계)

- `apps/api/src/seyeon-c08-memory-authority-proof-v1.ts`는 단일 `life_fact/memory` 타입의 `claimKind=fact`를 대상으로 DB가 확인한 `memoryId/sourceRef/summaryHash/grantState=ACTIVE/origin=AUTHORITATIVE_STORED_USER_MEMORY/assistantGenerated=false`를 검증한다.
- 동일한 기억이라고 해도 `summaryHash`가 다르거나 User Grant가 철회·누락되면 HOLD. `relationship_event`나 `character_interpretation`, AI가 만든 이벤트는 거부.
- 성공해도 `memoryMayBeSentToModel=false`, `memoryMayBeQuotedToUser=false`로 고정한다. 향후 **서버가 검증된 정확한 기억 내용을 불변 슬롯으로 출력할 계약**을 마련하기 전에는 모델에게 사적인 기억을 제공하거나 Callback을 출력하지 않는다.
- 이 메모리 증명 함수는 아직 `runSeyeonC08LocalOneCallShadowV1`에 연결하지 않았다. 현재 1회 생성 경로의 `retrievedMemories.length=0` 제한은 유지한다.

## 같은 브랜치 작업 규칙

사용자 지시: 브랜치 하나에서 구조 변경 구현을 끝까지 진행. 작업 완료 전 PR 병합, Full Integration CI, 새 유료 호출 금지.
