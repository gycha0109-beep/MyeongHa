# 명하 Cost / Quota / Abuse Control Specification v0.3

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md` §21.4 Cost / Abuse Controls  
> Rule: 구체 quota 숫자는 product policy/config로 두되 우회 불가능한 server gate를 정의한다.

---

## 1. 목적

AI/Saju/multi-character/push처럼 비용이 발생하거나 abuse 가능한 경로를 client 임의 제한에 맡기지 않는다.

## 2. Control Layers

```text
Transport rate limit
→ identity/session abuse gate
→ feature quota gate
→ entitlement/product gate
→ AI/Saju context/cost budget
→ domain command
```

429 응답만 존재하고 실제 budget authority가 없는 상태를 완료로 간주하지 않는다.

## 3. Rate-Limit Identity

우선 key:

```text
member → canonical subject id
guest  → verified guest session/subject
public share/bootstrap → route-specific anonymous abuse key
```

IP/device 정보가 보조 abuse signal로 필요하면 privacy-minimized 형태와 retention을 사용하며 `OPEN-P0: P0-PR-01`을 따른다.

Client가 rate-limit owner key를 직접 정하지 않는다.

## 4. Policy Registry

각 제한은 versioned policy key를 가진다.

```ts
interface UsagePolicyV1 {
  policyVersion: string;
  featureKey: UsageFeatureKey;
  subjectClass: 'guest'|'member';
  window?: { kind:'fixed'|'rolling'; seconds:number };
  maxRequests?: number;
  maxConcurrent?: number;
  maxAiInputTokens?: number;
  maxAiOutputTokens?: number;
  maxContextItems?: number;
  maxSceneTurns?: number;
  entitlementRequirement?: EntitlementRequirement;
}
```

구체 수치는 source가 결정하지 않았으므로 `CANDIDATE/config`다. 다만 production에서 활성화된 정책은 immutable `policyVersion + contentHash` artifact로 pin하며 동일 version의 수치를 조용히 변경하지 않는다.

## 5. Feature Keys

초기 bounded family:

```text
chat
saju_reading
reading_retry
multi_character_scene
memory_proposal
share_create
commerce_verify
notification_schedule
public_share_read
```

unknown feature key는 policy bypass가 아니라 deny/default-safe policy로 처리한다.

## 6. AI Budget

AI runtime은 provider 호출 전 server에서 최소:

- selected memories/life facts count
- recent message window
- canon context size
- grounding payload size
- expected input/output token budget
- scene max turns

를 제한한다.

Budget 때문에 context를 줄일 때 **Saju qualifier/prohibited inference/material ambiguity를 제거해서는 안 된다.** 필요하면 response를 축소하거나 fail/clarify한다.

## 7. Saju Budget / Retry

- transient retry 횟수는 bounded policy
- user clarification은 transport retry quota와 별도
- unavailable/invalid contract를 반복 호출하는 무한 fallback 금지
- retry budget 소진 시 stable normalized error

구체 transport retry 값은 `OPEN-P0: P0-SA-01` 결정 이후 runbook에 pin한다.

## 8. Multi-Character Scene

Scene Director는 finite `maxTurns`를 반드시 가진다.

- participant 수 cap
- AI calls cap
- recursive scene spawn 금지
- scene 안에서 새 scene 자동 생성 금지

## 9. Free / Paid Quota

무료/유료 quota를 도입할 경우 entitlement가 최종 gate다.

```text
quota eligibility
+ effective entitlement when required
→ allowed
```

Client 결제 성공 화면이나 local counter로 quota/paid access를 올리지 않는다.

정확한 monetization quota는 product decision이며 본 spec이 숫자를 임의 확정하지 않는다.

## 10. Abuse Controls

탐지 후보:

- identical payload burst
- repeated failed auth/guest token
- share-token enumeration
- receipt verification brute-force
- extreme chat/reading retry loops
- notification-trigger farming
- relationship-event farming

Abuse detection가 Saju 결과/관계 결과를 조작하는 semantic input이 되어서는 안 된다. 차단/속도 제한만 담당한다.

## 11. Relationship / Episode Farming

Rate limit과 별개로 domain policy가 같은 source action의 반복 적용을 idempotent/anti-farming 처리한다.

```text
rate-limit passed
!=
relationship event allowed
```

## 12. Observability

privacy-minimized metrics:

- allowed/denied counts by feature key/policy version
- rate-limit hit rate
- AI token/budget utilization
- Saju retry count
- scene turn count
- abuse rule hit count

raw chat/Birth/receipt를 quota telemetry에 복제하지 않는다.

## 13. Failure Behavior

Quota/abuse gate failure는 side effect 전에 발생해야 한다.

- denied chat → no turn side effects beyond auditable minimal request state if needed
- denied Saju → no reading execution attempt
- denied notification → no delivery
- denied commerce verify → no entitlement event

## 14. Verification

- same subject burst → policy limit enforced
- foreign client-supplied owner key → ignored
- guest creates new raw token repeatedly → bootstrap abuse policy applies
- prompt/context over budget → bounded reduction or safe failure
- qualifier/ambiguity never dropped to fit token budget
- multi-character maxTurns cannot be exceeded by LLM
- retry budget exhaustion → no infinite provider loop
- entitlement-required quota with no entitlement → deny
- rate limit cannot be used to bypass relationship/episode idempotency
