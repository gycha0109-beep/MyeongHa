# 명하 Notification / Return-Loop Specification v0.6 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.6**  
> Date: **2026-08-29**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`  
> Shared Contracts: `SHARED_DOMAIN_CONTRACTS_SPEC.md`  
> Source Gaps: `SRC-12`, `SRC-13`, `SRC-19`, `SRC-31`, `SRC-32`

---

## 1. 목적

캐릭터가 앱에 상주하는 느낌과 일/월/연간 return loop를 만들되 spam, 허위 urgency, 잠금화면 개인정보 노출을 피한다.

## 2. Authority Model

```text
World/Reading/Content state
→ notification candidate

scheduler cadence/frequency/eligibility decision
→ SRC-32

notification row
→ logical stored notification authority

notification_delivery
→ installation별 delivery authority

notification_delivery_attempt
→ 실제 provider send attempt provenance

installation/platform configuration
→ provider resolver
→ attempt.provider audit provenance
```

Push payload 자체는 캐릭터 메시지나 world event의 authority가 아니다.

`notification_delivery_attempt`의 row-locked attempt allocator와 terminal provenance는 source-backed persistence boundary다. 다만 Primary Source가 요구하는 **installation/platform configuration → provider** resolver의 canonical input/mapping/registry는 아직 정의되지 않았다. 따라서 caller-supplied provider 문자열을 production routing authority로 취급하지 않으며 이 경계는 `SRC-31`을 따른다.

자동 notification candidate가 실제 logical notification으로 materialize될지, 언제 materialize될지, frequency cap에 의해 막힐지는 별도 `SRC-32` scheduler decision authority다.

## 3. Notification Category Contract

초기 bounded category:

```text
character_return
new_monthly_reading
episode_unlock
new_character
service_notice
```

category는 Primary Source가 정의한 bounded initial set을 벗어나 임의 문자열로 확장하지 않는다. Scheduler/provider가 새로운 category를 실행 authority로 만들려면 Source contract가 먼저 확장되어야 한다.

이 category 목록은 **각 category의 cadence/trigger/frequency-cap algorithm까지 정의하지 않는다.** 그 실행 정책은 `SRC-32`가 OPEN이다.

## 4. Preview Privacy

```text
discreet
→ "명하에 새 소식이 있습니다."

character_only
→ "연화에게서 새 메시지가 있습니다."

full
→ 해당 notification template이 허용한 bounded preview
```

기본 mode는 민감한 상담 내용을 포함하지 않는 mode다.

`full`이어도 다음을 자동 삽입하지 않는다.

- relationship_status / 결혼 여부 등 Life Fact 원문
- 고민/대화 원문
- Birth input
- target person 정보
- memory content 원문

구체 preview가 필요하면 **notification template schema가 허용한 최소 projection**만 사용한다.

## 5. Device Installation

Source-backed invariants:

- active `(platform, installation_key)` global unique
- active push token fingerprint unique
- raw push token은 암호화 저장
- logout/account switch 시 이전 installation revoke 후 같은 install/token을 다른 subject에 attach
- revoked installation은 새 delivery 대상에서 제외
- client가 `subject_id`를 직접 지정해 다른 사용자 installation을 등록하지 못한다

다만 source는 **same-subject register retry / re-registration / push-token rotation lifecycle**을 정의하지 않는다. 특히 active row를 in-place update할지, revoke+new generation으로 만들지, revoked row를 재활성화할지, app/client capability/last_seen을 어떤 transition에서 갱신할지가 없다.

따라서:

```text
POST /api/device-installations/:id/revoke
→ source-complete

POST /api/device-installations/register
→ SRC-19 OPEN
```

`SRC-19` 해결 전 단순 UPSERT나 token-steal/rebind를 production registration authority로 승격하지 않는다.

또한 이미 저장된 eligible installation에서 실제 push attempt를 만들 때의 provider 선택은 별도 `SRC-31` 경계다. `platform IN ('ios','android','web')`와 provider column의 `e.g. apns | fcm | web_push`만으로 `ios→apns`, `android→fcm`, `web→web_push`를 normative mapping으로 만들지 않는다. Registration lifecycle과 provider routing lifecycle은 서로 자동 해결되지 않는다.

## 6. Preference Model

Primary Source가 요구하는 high-level preference boundary:

```text
global notification control
+ category preference
+ timezone / quiet hours
+ preview privacy
+ provider/OS permission state
→ notification eligibility에 반영
```

OS 권한 거절로 핵심 서비스 이용을 막지 않는다.

저장된 preference row가 없을 때의 default/materialization semantics는 `SRC-12`가 OPEN이다. Preference 모델이 존재한다는 사실만으로 scheduler의 최종 cadence/frequency decision이 해결되지는 않으며, 그 부분은 `SRC-32`다.

## 7. Scheduler Eligibility

Primary Source가 source-complete하게 요구하는 scheduler의 **상위 제약**은 다음과 같다.

- 실제 character/content/reading/world 상태에 근거해야 한다
- notification opt-in/opt-out을 존중해야 한다
- timezone / quiet-hours를 존중해야 한다
- 서버가 frequency cap을 관리해야 한다
- 허위 urgency나 존재하지 않는 source event를 만들지 않는다
- account/deletion lifecycle의 차단 경계를 우회하지 않는다

그러나 이 요구를 실행하는 final production evaluator는 아직 Source-complete하지 않다.

특히 다음은 `SRC-32` 해결 전 Pack이 임의로 정할 수 없다.

```text
trigger positive schema
category별 exact threshold/cadence
frequency-cap window/count/scope
candidate replay/concurrency
logical notification dedupe identity
template-selection mapping
stale candidate cancel/defer/expire semantics
policy change/provenance semantics
```

따라서 “Scheduler가 조건을 확인한다”는 Primary Source 요구를 근거로 Pack이 임의 numeric policy나 DSL을 만들지 않는다.

## 8. Return Loop Candidate Triggers

Use Case가 제시하는 **candidate example**:

- 마지막 캐릭터 대화 후 일정 기간 경과 — 예시로 3일이 제시됨
- 월운/연운이 실제 available 상태가 됨
- episode unlock
- new character/content release
- 사용자가 명시적으로 저장한 예정 사건 임박

이 목록은 final closed trigger registry가 아니다.

특히 다음 등치는 금지한다.

```text
Use Case example “3 days”
≠ universal character_return threshold

server-managed frequency cap requirement
≠ source-defined cap window/count

notifications.dedupe_key column
≠ source-defined scheduler dedupe-key construction
```

Primary Source는 final `NotificationPolicyDefinition`, `policyVersion`, `contentHash`, cadence registry schema를 정의하지 않는다. 따라서 구체 cadence/frequency/eligibility policy는 `SRC-32` 해결 전 production authority로 승격하지 않는다.

## 9. Notification Creation

Source-aligned conceptual flow:

```text
Domain/World/Reading/Content state
→ scheduler candidate
→ source-approved eligibility/cadence/frequency decision [SRC-32]
→ logical notification materialization
→ eligible active installations
→ notification_deliveries
→ source-approved provider resolution [SRC-31]
→ provider attempts
```

동일 source event 재처리로 logical notification을 중복 생성해서는 안 된다는 방향은 유지한다. 다만 autonomous scheduler에서 **무엇이 동일 logical notification인지, dedupe_key를 어떻게 canonicalize하는지**는 `SRC-32` 해결 전 임의 구현하지 않는다.

Delivery DB attempt allocation/finalization mechanics는 현재 검증 가능하지만, production provider selection은 `SRC-31` 해결 전 source-complete라고 선언하지 않는다.

## 10. Deep Link Contract

예:

```text
myeongha://character/:id/chat
myeongha://reading/:id
myeongha://episode/:id
```

Push에는 가능한 한:

```text
notificationId
routeIntentKey
public character/episode stable key where safe
```

만 넣는다.

private reading/thread identifier가 포함되더라도 **ID 소유 자체가 authorization이 아니다.** Client는 route open 시 API에서 resource 권한을 다시 검증한다.

## 11. Delivery Retry

Source-backed structural retry chain:

```text
notification
→ delivery(device)
→ attempt 1
→ failed
→ later attempt allocation
→ attempt 2
```

불변식:

- `(notification_id, installation_id)` logical delivery 중복 금지
- `next_attempt_no` allocator는 row lock
- provider attempt provenance append
- provider message ref는 delivery authority가 아님
- revoked installation / cancelled notification은 추가 attempt 금지
- terminal `sent` logical delivery에 provider retry로 두 번째 logical send를 생성하지 않는다
- exact attempt replay가 historical provider provenance를 바꾸지 않는다

이 section의 `attempt 1 → failed → attempt 2`는 **재시도 가능한 persistence/concurrency 구조**를 뜻한다. Primary Source는 automatic retry의 delay/backoff, max-attempt, retryable/final provider error taxonomy, provider failover를 정의하지 않는다. 따라서 현재 DB allocator가 failed delivery에서 다음 attempt를 만들 수 있다는 이유만으로 production scheduler가 임의 backoff/limit/error-classification을 채택하지 않는다.

Provider identity 자체도 `SRC-31` 해결 전 caller assertion으로 확정하지 않는다. Retry에서 같은 provider를 유지할지 재-resolve할지, provider failover를 허용할지도 source가 정하기 전에는 정책으로 승격하지 않는다.

## 12. Notification State vs Delivery State

`notifications.status=read`는 사용자가 stored notification item을 읽었다는 의미다.

이는:

```text
push delivered
push opened
character message committed
```

과 동일하지 않다.

Final inbox status membership/filter/order semantics는 별도 `SRC-13` 경계다. Analytics event와 DB status를 혼합하지 않는다.

## 13. Deletion / Lifecycle

Account deletion 시작 시 source-backed cleanup boundary:

- active installations revoke
- queued/ready notification cancel
- future scheduler eligibility 차단

이미 provider에 전달된 OS notification을 원격으로 완전히 회수할 수 있다고 가정하지 않는다. 대신 이후 deep-link resource access는 서버 authorization으로 차단한다.

실제 retention은 `OPEN-P0: P0-PR-01`.

## 14. Verification

현재 independently testable:

- unknown/out-of-contract NotificationCategory → no authoritative schedule/send
- notification A → subject B installation → DENY
- same logical notification/device stored delivery duplicate → one delivery
- concurrent attempt allocation → unique attempt_no
- exact attempt-id replay → provider/attempt identity immutable
- revoked installation → no new send
- discreet/default preview → sensitive content absent
- full preview → only source-approved/template-approved projection where defined
- deletion_pending → new delivery/scheduler path cannot bypass lifecycle block
- private deep link unauthorized → DENY
- push retry persistence → no duplicate character/world event authority

Source-resolution gates:

- missing preference default/materialization tests remain blocked by `SRC-12`
- final inbox membership/status tests remain blocked by `SRC-13`
- registration lifecycle tests remain blocked until `SRC-19` defines retry/re-registration/token-rotation semantics
- production provider derivation/mismatch/alias/failover tests remain blocked until `SRC-31` defines provider resolver authority
- autonomous trigger/cadence/frequency-cap/dedupe/template-selection/concurrent materialization tests remain blocked until `SRC-32` defines scheduler decision authority
- automatic delivery retry timing/backoff/max-attempt/error-classification tests are not invented from the current allocator-only authority
