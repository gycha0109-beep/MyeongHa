# SRC-31 — Notification Delivery Provider Resolution Authority

> Status: **OPEN / BLOCKING for production-authoritative push-provider selection at notification attempt creation**  
> Domain: Notification Delivery / Provider Routing / Attempt Provenance  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
> - repository `NOTIFICATION_RETURN_LOOP_SPEC.md`
> - existing `0280_notification_delivery_attempt_commands.sql`
> - existing notification delivery attempt concurrency tests
>
> This gap does **not** invalidate the source-backed logical-delivery row, attempt-number allocator, attempt terminalization mechanics, revoked-installation checks, or stored delivery/attempt read projections. It specifically blocks treating a caller-supplied provider string as authoritative routing/provenance.

---

## 1. Gap

Primary Source explicitly states for `notification_delivery_attempts`:

```text
Provider is resolved from installation/platform configuration at attempt creation
and recorded for audit.
```

Primary Source also defines `device_installations.platform` as:

```text
ios | android | web
```

and `notification_delivery_attempts.provider` as a required text value with examples:

```text
apns | fcm | web_push
```

However, Primary Source does **not** define the executable resolver that converts installation/platform configuration into the authoritative provider value.

The current `device_installations` schema has no provider/config/version column. The reviewed Primary Sources contain no normative mapping such as:

```text
ios     -> apns
android -> fcm
web     -> web_push
```

and no provider-routing configuration registry is defined.

Therefore neither of these implementations is source-authoritative:

```text
A. trust caller p_provider and store it
B. hard-code a CASE expression from platform to provider by convention
```

The missing resolver authority is recorded as `SRC-31`.

## 2. Source-complete stored boundaries

Primary Source already fixes the storage/provenance shape.

### Device installation

`device_installations` provides:

```text
id
subject_id
platform
installation_key
push_token_encrypted
push_token_key_id
token_fingerprint
app_version
client_capability
last_seen_at
revoked_at
created_at
```

with:

```text
platform IN ('ios','android','web')
```

and owner/token/revocation invariants.

### Logical delivery

`notification_deliveries` provides one current-state row per:

```text
notification × installation
```

with:

```text
status = pending | sending | sent | failed | cancelled
next_attempt_no >= 1
UNIQUE(notification_id, installation_id)
```

The worker must lock this row to allocate the next attempt number.

### Provider attempt ledger

`notification_delivery_attempts` is the immutable terminal provenance of actual provider sends:

```text
id
delivery_id
subject_id
attempt_no
provider
status = running | sent | failed
provider_message_ref
error_code
started_at
finished_at
```

with:

```text
UNIQUE(delivery_id, attempt_no)
running -> sent/failed
terminal attempt rows immutable
```

Those shapes remain authoritative. `SRC-31` concerns **how the `provider` value is selected before the attempt row is created**.

## 3. Existing allocator/finalizer mechanics remain structurally source-backed

Primary Source requires:

```text
notification × active installation
→ get/create logical delivery
→ lock delivery / allocate attempt_no
→ append provider attempt
→ external send
→ finalize attempt + logical delivery
```

and explicitly includes a concurrent retry-attempt allocator verification requirement.

Accordingly, these mechanics are independent of the missing provider resolver:

- one logical delivery per notification/installation;
- row-locked `next_attempt_no` allocation;
- one running attempt at a time for the same logical delivery;
- append attempt provenance;
- running attempt terminalizes to exactly one of `sent` or `failed`;
- successful attempt closes logical delivery as `sent`;
- failed attempt leaves logical delivery in stored `failed` state from which a later allocator invocation can create the next attempt;
- revoked installation cannot start a new attempt;
- cancelled/expired notification cannot start a new attempt;
- terminal `sent` logical delivery cannot allocate another attempt;
- exact attempt-id replay may return the already-recorded authoritative attempt rather than allocate a duplicate.

These boundaries do not authorize an arbitrary provider string.

## 4. Current implementation does not enforce the Primary Source resolver requirement

Existing:

```text
cmd_prepare_notification_delivery_attempt_v1(
  p_subject_id,
  p_delivery_id,
  p_attempt_id,
  p_provider
)
```

accepts a non-empty caller-provided `p_provider` and persists it into `notification_delivery_attempts.provider`.

The command validates:

- delivery ownership;
- subject active state;
- notification eligibility;
- installation ownership/revocation/token presence;
- logical delivery state;
- one-running-attempt concurrency;
- attempt-id replay identity;
- attempt number allocation.

But it does **not** prove that `p_provider` was resolved from the linked installation/platform configuration.

Therefore the command currently provides a sound attempt allocation/finalization primitive, but its provider-selection input must not be described as a production-authoritative implementation of the Primary Source provider-routing rule.

## 5. Existing tests also treat provider as caller assertion

The current concurrency test helper receives:

```text
prepare_attempt(delivery_id, attempt_id, provider)
```

and directly supplies values such as:

```text
apns
fcm
webpush
```

The fixture includes installations with:

```text
ios
android
web
```

but the test does not assert that the provider value is derived from or compatible with the installation platform.

It also uses `webpush` while the ERD provider examples use `web_push`, demonstrating why example strings cannot safely be promoted into a hidden canonical registry by convention.

This is not merely missing test coverage. The authoritative resolver/mapping itself is absent from Primary Source, so a correct positive test cannot be written yet without inventing policy.

## 6. Why `platform` alone is insufficient authority

A tempting implementation is:

```text
CASE platform
  WHEN 'ios' THEN 'apns'
  WHEN 'android' THEN 'fcm'
  WHEN 'web' THEN 'web_push'
END
```

That may be operationally plausible, but Primary Source does not state it as a normative mapping.

The phrase `installation/platform configuration` also leaves open whether provider resolution depends on more than `platform`, for example:

- deployment/environment configuration;
- app distribution channel;
- provider migration or fallback configuration;
- web push implementation/provider variant;
- tenant/project/provider credential set;
- client capability/version;
- provider availability/kill-switch state.

None of those possibilities should be assumed either. The point is not that such complexity must exist; the point is that Source has not selected the resolver contract.

## 7. Provider examples are not a canonical registry

The ERD column description says:

```text
provider text NOT NULL e.g. apns | fcm | web_push
```

`e.g.` is illustrative, not a positive closed enum declaration.

Primary Source does not currently provide:

```text
provider IN ('apns','fcm','web_push')
```

as a CHECK/invariant, nor a versioned provider registry.

Therefore implementation must not infer:

- that exactly those three provider values are permanently exhaustive;
- that aliases such as `webpush` are valid or invalid;
- that provider names are case-normalized in a particular way;
- that a provider value may be changed without version/provenance implications.

## 8. Caller assertion vs server resolution is unresolved

Primary Source says provider **is resolved** from installation/platform configuration, which implies that the authoritative value cannot merely be arbitrary user/client input.

It does not yet define where resolution runs:

```text
DB command
API/service layer
notification worker
provider adapter registry
```

Nor does it define whether an internal worker may pass a resolved provider plus evidence that the DB validates, or whether the DB must resolve it itself.

Until this is decided, the Pack must not claim that a plain `text p_provider` parameter is itself the authority boundary.

## 9. Configuration/provenance version is missing

If provider routing is configuration-driven, Primary Source does not define what provenance is required to reproduce the routing decision.

Open questions include:

```text
Does attempt.provider alone fully identify the resolver result?
Is provider configuration version/hash required?
Must environment/project/credential-set identity be recorded?
Is routing configuration mutable?
If configuration changes between retry attempts, may provider change?
```

Do not add new columns or a provider-configuration table solely to solve these questions. Their necessity and shape must be source-selected.

## 10. Retry across provider changes is unresolved

Primary Source requires provider attempt provenance and retry allocation, but without a resolver contract it does not state whether retries for one logical delivery must use the same provider.

Unresolved cases include:

```text
attempt 1: provider A failed
attempt 2: same provider A?
attempt 2: newly resolved provider B after configuration change?
provider failover A -> B?
provider migration while delivery is failed?
```

The current allocator permits the caller to supply a different provider on a later attempt. That preserves per-attempt provenance but does not establish whether the routing transition itself is authorized.

Until `SRC-31` is resolved, tests may verify attempt-number and terminal-state mechanics, but must not interpret arbitrary provider changes as source-approved failover semantics.

## 11. Relationship to retry timing / policy

Primary Source clearly requires a retry-attempt allocator and a push-retry failure/recovery test, so allocating a later attempt after a stored failed attempt is source-backed as a mechanical boundary.

However, Primary Source does not currently define a generic backoff/max-attempt scheduler for notification delivery in the reviewed schema.

The existing DB command is ID-directed and does not itself schedule retries. Therefore `SRC-31` does not invent a retry cadence or claim that immediate automatic retry is authorized.

If a future production worker needs normative retry delay, cap, error classification, or provider-failover policy, that policy must be sourced explicitly rather than inferred from this provider-resolution gap.

## 12. Relationship to `SRC-19`

`SRC-19` covers:

```text
Device Installation registration / re-registration / token rotation lifecycle
```

It answers questions about how installation rows and push tokens are created, replayed, rotated, revoked, and rebound.

`SRC-31` is distinct:

```text
Given an already-stored eligible installation,
which push provider is authoritative for a new delivery attempt?
```

Resolution may eventually choose to persist provider-routing configuration as part of installation registration, in which case `SRC-19` and `SRC-31` will compose. But one gap does not automatically resolve the other.

Standalone installation revoke remains source-complete and unrelated to provider selection.

## 13. Relationship to P0 / provider operational choices

Choosing actual provider credentials, SDKs, service accounts, environment endpoints, or deployment runbooks may be an operational/P0 matter.

That does not authorize the application data contract to persist an arbitrary provider value as if it were source-derived.

The Source must still define enough logical routing authority to answer:

```text
what configuration is read
who owns it
what deterministic output/provider identity it produces
what must be persisted for audit
```

Operational provider setup and data-model provider resolution are related but separate concerns.

## 14. Affected implementation surface

Blocked from production-authoritative promotion by `SRC-31`:

```text
caller-selected p_provider as routing authority
hard-coded platform -> provider CASE invented from examples
unvalidated arbitrary provider aliases
provider fallback/failover between attempts
provider-routing configuration mutation
claims that cmd_prepare_notification_delivery_attempt_v1 fully enforces provider selection authority
```

Not blocked:

```text
notification_deliveries stored current state
notification_delivery_attempts stored attempt provenance
row-locked next_attempt_no allocation
attempt-id replay/concurrency protection
sent/failed attempt terminalization
sent logical-delivery terminal state
revoked installation / cancelled notification attempt denial
owner-scoped B75 delivery/attempt read projections
```

## 15. Pack / implementation must NOT invent

Until `SRC-31` is resolved, do not:

- treat `ios -> apns`, `android -> fcm`, `web -> web_push` as normative merely because it is conventional;
- treat the ERD `e.g.` provider strings as a closed registry;
- silently normalize `webpush` to `web_push` or vice versa;
- allow public/client callers to choose provider;
- claim an internal caller-provided provider string is source-derived without an approved resolver boundary;
- add a provider column to `device_installations` by convention;
- add a provider-routing table/registry without source authority;
- invent provider configuration version/hash provenance;
- permit or prohibit cross-provider retry/failover by convention;
- bind provider selection to app version/client capability unless Source explicitly chooses that rule;
- rewrite existing terminal attempt provider provenance when routing configuration changes.

## 16. Required source resolution

At minimum Primary Source should define:

1. authoritative provider resolver inputs;
2. resolver owner/layer: DB, service, worker, or versioned registry;
3. the canonical provider identity vocabulary or registry authority;
4. whether platform alone determines provider;
5. if platform determines provider, the exact normative mapping;
6. normalization/case/alias rules;
7. whether provider configuration can vary by environment/app/channel/capability;
8. whether routing configuration is mutable and how changes are versioned;
9. whether attempt provenance requires configuration version/hash in addition to provider;
10. whether retries must preserve provider or may re-resolve;
11. any source-approved provider failover semantics;
12. how resolver failure behaves: deny attempt, defer, or another explicit state;
13. whether `cmd_prepare_notification_delivery_attempt_v1` should remove `p_provider`, validate it, or accept a trusted resolver result plus provenance;
14. how this boundary composes with `SRC-19` registration lifecycle if provider configuration is installation-scoped.

## 17. Verification after resolution

At minimum tests should prove:

- an eligible installation resolves exactly one authoritative provider under the approved configuration;
- a caller cannot inject a mismatched/arbitrary provider;
- provider identity stored on the attempt exactly matches the resolver result;
- unknown/unsupported platform/config fails closed;
- alias/normalization behavior follows the approved registry exactly;
- concurrent attempt allocation still produces one unique attempt number;
- exact attempt-id replay cannot change provider identity;
- a reused attempt id with a different provider/config identity is rejected;
- revoked installations remain ineligible before provider resolution/send;
- cancelled/expired notifications remain ineligible;
- retry provider behavior follows the approved same-provider/re-resolve/failover rule;
- routing configuration changes never rewrite historical terminal attempt provenance;
- `notification_delivery_attempt_concurrency.sh` is updated to assert provider derivation rather than caller assertion;
- B75 stored delivery/attempt projections remain green;
- deterministic catalog is updated only if the approved resolution introduces DB object changes.

## 18. Current fail-closed interpretation

Until `SRC-31` is resolved:

```text
Attempt allocation/finalization mechanics
= source-backed persistence/concurrency primitive

Provider selection supplied via p_provider
= NOT sufficient production routing authority
```

A production notification worker must not be declared source-complete solely because the DB can allocate, record, and finalize attempts. The missing provider resolver is part of the send authority boundary mandated by Primary Source.
