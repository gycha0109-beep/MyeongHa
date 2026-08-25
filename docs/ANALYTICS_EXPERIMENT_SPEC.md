# 명하 Analytics / Experiment Contract Specification v0.3

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md` §18 Success Metrics / §21.8 Analytics Event Contract  
> Privacy Authority: `AUTH_RLS_PRIVACY_SPEC.md`

---

## 1. 목적

Funnel/retention/experiment telemetry가 제품 DB의 shadow PII store 또는 Saju semantic authority가 되지 않도록 event contract를 versioning한다.

## 2. Event Contract

```ts
interface AnalyticsEventEnvelopeV1<T> {
  eventName: AnalyticsEventName;
  eventSchemaVersion: string;
  eventId: string;
  occurredAt: string;
  anonymousOrSubjectRef: string;
  sessionRef?: string;
  client: 'web'|'ios'|'android'|'server';
  appVersion?: string;
  payload: T;
}
```

`anonymousOrSubjectRef`는 analytics 전용 pseudonymous ref이며 raw auth user ID/email/guest bearer token이 아니다.

## 3. Baseline Event Registry

Use Case baseline:

```text
LANDING_VIEWED
ENTERED_HALL
CHARACTER_SELECTED
BIRTH_RECORD_STARTED
BIRTH_RECORD_COMPLETED
FIRST_READING_DELIVERED
MEMORY_PROPOSED
MEMORY_ACCEPTED
RELATIONSHIP_STAGE_CHANGED
READING_PURCHASED
RETURN_PUSH_OPENED
```

추가 event는 registry/schema version 없이는 발행하지 않는다.

## 4. Payload Minimization

기본 금지:

- raw birth date/time
- exact BirthProfile input
- full chat text
- Memory/Life Fact value
- target person data
- raw receipt/provider account
- raw Saju narrative/semantic claim payload
- auth token/service secret

허용 예:

```text
character stable ID
saju domain key
coverage category if product-safe
content release/bundle version
relationship stage key
boolean completion
latency bucket
purchase product key
error/capability category
```

필요성 없는 high-cardinality internal IDs도 최소화한다.

## 5. Server vs Client Events

Authority-changing event의 성공 여부는 server event가 기준이다.

예:

```text
client button click → intent analytics
server relationship commit → RELATIONSHIP_STAGE_CHANGED
server entitlement commit → purchase/entitlement success analytics
```

Client가 local optimistic success를 authoritative conversion으로 기록하지 않는다.

## 6. Idempotency

Server analytics는 domain/outbox event의 stable dedupe identity를 사용해 retry 중복을 방지한다.

Client-only view/click event는 별도 eventId/session rules를 사용한다.

## 7. Experiment Assignment

Experiment assignment은 versioned:

```ts
interface ExperimentAssignment {
  experimentKey: string;
  experimentVersion: string;
  variantKey: string;
  assignmentPolicyVersion: string;
}
```

stable identity/cohort가 동일 active experiment set에서 request마다 흔들리지 않아야 한다.

## 8. Experiment Boundary

실험 가능:

- landing copy/layout
- character presentation/order
- notification copy/frequency within policy
- UI sequence
- deterministic narrative presentation template version when Saju authority permits

실험으로 임의 변경 금지:

- Saju semantic claim meaning
- methodology/rule authority
- prohibited inference
- privacy grant scope
- relationship score mutation policy without explicit policy-version experiment governance
- entitlement verification

## 9. Saju Experiment Separation

Saju research/benchmark telemetry와 product funnel analytics를 동일 payload stream으로 섞지 않는다.

Personalization benchmark의 `InterpretationSignature`, consumed fingerprints 등은 Saju repository verification authority이며 일반 명하 product analytics identity로 사용하지 않는다.

## 10. Consent / Retention

Analytics consent/opt-out와 retention의 법적/제품 정책은 `OPEN-P0: P0-PR-01` 및 적용되는 consent policy를 따른다. 본 spec은 보존 기간을 임의 확정하지 않는다.

## 11. Schema Evolution

- additive payload change 우선
- semantic meaning 변경 → schema version bump
- consumer가 모르는 major version → silent misparse 금지
- deprecated event는 dashboard/query migration evidence 후 제거

## 12. Verification

- raw Birth/chat/Memory/receipt payload detector
- client optimistic purchase ≠ server conversion
- duplicate outbox retry → one server conversion event
- same experiment identity → stable variant
- experiment variant cannot alter Saju semantic input/output authority
- analytics unknown schema → quarantine/reject, silent accept 금지
- deletion/retention policy가 analytics pseudonymous linkage에 반영되는지 검증
