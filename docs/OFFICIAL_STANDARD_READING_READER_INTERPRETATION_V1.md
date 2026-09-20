# Official Standard Reading + Reader Interpretation Architecture v1

> Repository: `gycha0109-beep/MyeongHa`  
> Fresh baseline: `main @ 4a94fa816390ecf15cd95ee915d4bb7ed4112093`  
> Status: **IMPLEMENTATION PR CANDIDATE / PRODUCTION HOLD**  
> Date: 2026-09-20

## 1. Conflict inventory

| Layer | Historical assumption | Current target |
|---|---|---|
| DB Reading identity | Reader stored directly on paid Reading | Reader-independent official Reading |
| Commerce consumption | one purchase Grant → one Reader-bound Reading | first purchase may create official Reading; later purchase grants Reader access only |
| Artifact reread | exact purchase Grant gates one Reader-bound artifact | exact Reader access Grant gates shared official artifact |
| Character knowledge | no final Reader-scoped official-Reading source | exact Character may see only official Readings opened to it |
| Revoke | exact binding Grant closes that Reader-bound artifact | exact Reader Grant closes only that Reader access |
| UX | different Reader implies another Reading | Additional Reader Interpretation reuses official Reading |

## 2. Reuse / modify / obsolete

### Reuse unchanged

- `purchase_intent_reader_selections` immutable Reader selection provenance.
- verified Purchase Intent and exact production Receipt lineage.
- exact purchase-backed `entitlement_grants` lifecycle.
- `reading_sessions / readings / reading_execution_attempts / reading_refs` as official Saju artifact authority.
- committed execution-attempt parity from #1099.
- direct merged-Guest lineage for historical owner access.
- ordinary runtime denial of raw `response_snapshot_jsonb`.
- client-minimal request contract: client supplies only Purchase Intent identity at bind time.

### Modify for new runtime

- generation bind: `cmd_bind_standard_reading_access_v2`.
- Reading creation: requested Character fields are NULL for official Reading.
- reread source: Reader-scoped v2 authority.
- Character Chat source: exact Reader Knowledge metadata query.
- refund/revoke: evaluate exact Reader access Grant, not aggregate entitlement.

### Legacy only

- `standard_reading_unit_bindings`.
- `cmd_bind_standard_reading_unit_v1`.
- `internal_qry_standard_reading_artifact_source_v1`.
- semantic reading of historical `purchase_unit_mode=topic_reader_reading` as “different Reader = different official Reading”.

Legacy rows/functions are preserved for provenance; they are not rewritten.

## 3. Official Reading reusable identity

Minimum current key:

```text
subject_id
product_id
source_birth_revision_id
topic_key
saju_domain
reading_period
reading_variant
product_spec_version
domain_capability_version
```

This is intentionally stricter than “same topic”. A new Birth revision, Product spec, or domain capability version does not silently reuse an older official Reading.

## 4. First vs Additional Reader

```text
FIRST
verified purchase + exact active Grant
→ no matching official Reading
→ create Reader-independent pending Reading
→ bind official identity
→ create selected Reader Interpretation identity
→ bind exact Reader access

ADDITIONAL
verified purchase + exact active Grant
→ exact matching committed official Reading exists
→ do not create Reading
→ create selected Reader Interpretation identity if absent
→ bind exact Reader access
```

An additional Reader cannot attach to a pending/failed/uncommitted official Reading.

## 5. Reader Interpretation authority

`standard_reading_reader_interpretations` is a logical presentation identity. It does not contain Saju Source Truth and currently does not persist generated prose. A future rendering artifact must remain downstream of the official Reading and source-grounded character rendering architecture.

## 6. Reader Knowledge

`internal_qry_character_standard_reading_access_v1` is metadata-only. It requires the exact Character and an active exact purchase-backed Reader Grant.

The raw source function remains internal and separately gated.

## 7. Revoke model

```text
Reader access effective state
= exact access row
+ exact Entitlement Grant lifecycle
```

Another active same-key Grant cannot keep a revoked Reader purchase open unless that separate Grant is explicitly bound to that Reader access.

Official Reading existence is independent from Reader effective access.

## 8. HOLD

No change in this PR activates:

- real Standard Product Offer or Charge Terms;
- checkout / PortOne;
- ordinary runtime EXECUTE on the new bind or raw artifact-source functions;
- Production Saju transport;
- Production Saju interpretation authority;
- public Character Chat Reading injection.

## 9. Regression contract

Required tests:

- first Reader → one official Reading;
- additional Reader → official Reading count unchanged;
- unpurchased Reader denied;
- Reader A revoke → only Reader A closed;
- Reader B remains open;
- different subject denied;
- same purchase replay deduped;
- different Readers observe the same official response hash;
- official Reading row has no requested Character identity;
- Production HOLD/ACL remains closed.
