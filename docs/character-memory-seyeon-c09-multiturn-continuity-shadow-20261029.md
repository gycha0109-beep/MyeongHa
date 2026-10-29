# C09 다중 턴 Character State → Decision → Renderer Shadow 연결 (2026-10-29)

**상태:** 연구용 구현 / Production 호출·DB·개인정보 전송·과금 변경 없음. 기존 첫 턴 Shadow의 후속 구현이다.

## 실제 추가 코드

- `apps/api/src/seyeon-c09-continuity-shadow-v1.ts`: 기존 `assembleSeyeonRuntimeContextV2`에서 나온 다중 턴·기존 관계·조회된 Memory 후보를 처리하는 별도 opt-in Shadow API.
- `test/seyeon-c09-continuity-shadow-v1.test.ts`: 서버 출처 확인·revocation·동시 메시지·모델 위조 근거·기존 Guard 및 독립 의미 검토 테스트.
- 기존 `seyeon-fast-dialogue-shadow-v1.ts` 첫 턴 구현과 Production 라우팅을 변경하지 않는다. 기존 `TURN_INTERPRETATION_RESPONSE_SCHEMA_V2`와 `RENDERER_RESPONSE_SCHEMA_V2`를 함께 사용한다.

## 실행 흐름

1. **State:** 기존 Core Anchor(불변), 실제 최근 대화, 서버가 권한 있게 조회한 관계 Projection / 메모리, 동작 제한을 입력으로 사용한다. 모델이 저장된 감정·기억·관계인 척 임의 사실을 만들지 않는다.
2. **Authoritative Snapshot 필수:** `authoritySnapshotPort`는 subject/thread, 현재 사용자 메시지 ID, 전체 스레드 메시지 수, Memory Grant 집합 버전과 승인된 ID, 관계 Projection 버전, 현재 허용된 Context의 SHA256를 서버가 독립적으로 읽어 제공해야 한다. **현재는 이 계약만 있으며 실제 DB adapter는 연결되지 않았다.** 포트가 없거나 불일치하면 모델 호출 전에 실패한다.
3. **Decision:** 모델은 기존 구조화 Interpretation의 `notice / immediateWant / tension / chosenAction`와 근거를 제안한다. 이전 AI 대사와 사용자 주장은 자동 Canon·공유 기억이 아니다.
4. **Renderer:** 같은 후보 호출에서 대사를 생성한다. 기존 Interpretation Guard → Risk Causality → Renderer Packet/Draft Guard → 독립 Semantic Reviewer → Output Guard를 유지한다.
5. **Revocation·Concurrency:** 후보 생성 직후, 의미 검토 직후에 **출처를 재조회**한다(총 3회). 메모리 Grant 집합 버전, context fingerprint, 스레드 메시지 수, 관계 revision 중 어느 하나라도 달라지면 후보를 반환하지 않는다. 이는 Shadow 결과의 유효성 검사일 뿐 **DB commit/HTTP Reveal 트랜잭션 잠금이 아니다**.

## 구현 범위 및 제약

- 여러 대화 턴을 처리할 수 있지만 **공개 disclosure만** 허용한다. 기존 Disclosure가 비공개 자료를 반환한 Context는 현재 구현에서 명시적으로 거부한다.
- Memory Grant와 실제 허용 상태는 **포트 구현자가 독립적인 서버 DB 조회로 검증해야 한다**. 모델 입력·웹 클라이언트·호출자가 작성한 토큰/스냅샷을 신뢰하면 안전하지 않다. Context 해시 하나만으로 사용자 데이터 권한을 증명할 수 없다.
- 별도 사후 기억 저장·학습·관계 mutation을 하지 않는다. 등록된 memory가 있다고 해서 캐릭터의 객관적 지식/숙련도가 증가하지 않는다.
- 별도 전문 지식 Epistemic Resolver, 캐릭터의 지속적 내적 상태·세션 저장, 관계 Reveals, 실제 모델 다중 턴 품질 평가는 미구현이다.
- 모형 provider 기반 단위 테스트 통과이지 GLM/Luna 등 유료 모델 품질 실측이 아니다.

## 검증 (2026-10-29)

- `tsc -p tsconfig.build.json --noEmit`: **PASS**.
- `vitest run test/seyeon-c09-continuity-shadow-v1.test.ts test/seyeon-c09-state-decision-renderer-shadow-v1.test.ts test/seyeon-fast-dialogue-shadow-v1.test.ts`: **16/16 PASS**.
- 전체 `tsc -p tsconfig.json --noEmit`는 현재 Windows 임시 worktree가 원본 `node_modules`를 junction 공유하는 환경에서 mobile api-client private member 타입 이중 경로 문제를 보였으며 독립 CI로 확인해야 한다.

## 다음 실제 구현

1. Production의 승인된 Memory/Grant/Revocation과 관계 Projection을 읽는 **서버 소유 Snapshot Port**를 기존 read-layer에 연결하되, Production 모델 라우팅과 쓰기 권한은 계속 비활성화한다.
2. C1/C09 상태 작업에 세션 단기 상태의 수명/출처를 명시하고 재사용 가능한 학습 사실과 user-private memory를 분리한다.
3. 기존 C09 Gold에서 15개 사례 및 다중 사용자/다중 턴 false-premise·revocation·일관성 평가를 확대하고, 허용된 실측에서 GLM/Luna를 비교한다.
