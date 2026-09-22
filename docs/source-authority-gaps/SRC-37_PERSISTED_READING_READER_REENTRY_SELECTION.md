# SRC-37 — Persisted Reading Reader Re-entry Selection Authority

> Status: **OPEN / BLOCKING Records → Reader Scene re-entry**  
> Domain: Reading / Reader / Records  
> Scope: selecting the exact Reader identity when reopening a persisted Official Reading from Records

## 1. Gap

The repository already has authoritative Reader selection for **purchase creation**, but it does not have an authoritative Reader selection contract for **reopening a persisted Reading from Records**.

These are different operations.

Purchase creation accepts an explicit client choice:

```text
productOfferId + readerCharacterId
→ server Reader catalog/unlock validation
→ immutable purchase Reader selection provenance
```

Records currently carries:

```text
readingId + readingSessionId + sajuDomain
```

It does not carry a Reader Character id or Chat thread id.

Therefore the existing purchase-time Reader resolver cannot be reused as an automatic Records re-entry selector: it validates a Reader candidate already chosen for a purchase; it does not decide which Reader should own a later re-entry.

## 2. Existing source-backed authority

The following facts are already authoritative:

- `purchase_intent_reader_selections` preserves the Reader selected for an exact purchase intent.
- `standard_reading_reader_interpretations` permits multiple Reader identities for one Official Reading through primary key `(official_reading_id, reader_character_id)`.
- `standard_reading_reader_access_grants` preserves exact purchase-backed Reader access provenance.
- `internal_qry_standard_reading_artifact_source_v2` requires the caller to supply the exact Reader Character id and then verifies exact active Reader access.
- the thread-bound Reader runtime derives its Reader from the exact owner-authorized active single-Character Chat thread.
- `qry_reading_history_v1` and the browser Records handoff do not expose Reader or thread authority.

This means the repository can verify an exact Reader after one is authoritatively known. It cannot currently choose that Reader for a Records re-entry.

## 3. Why purchase-time Reader selection does not close this gap

`StandardReadingReaderSelectionPortV4.resolveEligibleReaderSelection` requires:

```text
subjectId
productId
readerCharacterId
```

The `readerCharacterId` is already a candidate before the resolver runs.

That resolver answers:

> “Is this explicitly selected Reader currently eligible for this Product?”

It does not answer:

> “Which Reader should Records choose for this persisted Official Reading?”

Promoting the first question into the second would manufacture selection authority.

## 4. Multi-Reader ambiguity is intentional

One Official Reading can have multiple Reader interpretations/access grants.

Accordingly, none of the following is authoritative without a separately reviewed contract:

- first Reader row;
- earliest Reader;
- latest Reader;
- initial Reader;
- alphabetically first Reader;
- currently open Character room;
- browser presentation Character;
- default Baekheon/Se-yeon;
- any Reader inferred from `sajuDomain`;
- any Reader inferred from static Character catalog order.

Database row order is not product selection policy.

## 5. Required source resolution

A reviewed re-entry authority must define how an exact persisted Official Reading obtains one Reader candidate before Reader Preview/Chat orchestration.

The source may only be adopted after its semantics are explicitly reviewed. Examples of source shapes that require such a decision include:

1. an exact persisted purchase/access context carried by a server-owned Records detail projection;
2. an owner-scoped server projection of purchased Reader interpretations followed by explicit user selection;
3. an explicit server-owned “last/primary Reader for this Reading” policy with defined lifecycle semantics;
4. another reviewed source that deterministically binds the persisted Reading to one exact Reader/thread context.

This document does not select among those designs.

## 6. Required output boundary

Once resolved, the authority must provide enough server-owned identity to enter the existing hardened chain without browser inference:

```text
persisted Official Reading
→ exact Reader selection authority
→ canonical readerCharacterId
→ owner-authorized Chat open/reuse
→ canonical threadId
→ thread-bound Reader Preview
```

The browser must not manufacture either `readerCharacterId` or `threadId`.

## 7. Verification gate after resolution

At minimum:

- one-Reader and multi-Reader Official Readings are handled deterministically according to the approved policy;
- a Reader without exact purchase-backed access cannot be selected;
- stale/revoked access fails closed;
- Records URL/query/local/session storage cannot become Reader authority;
- purchase-time eligibility validation is not treated as re-entry selection;
- no database row-order dependency exists;
- the resulting Reader identity is canonical, not a browser presentation key;
- Chat open returns the canonical thread id; the browser does not derive one from Reading ids.

## 8. Promotion boundary

```text
purchase-time explicit Reader selection + eligibility validation
→ enabled

per-Reader Official Reading access verification
→ enabled

Records persisted Reading identity handoff
→ enabled

Records persisted Reading → exact Reader re-entry selection
→ BLOCKED by SRC-37

exact Reader → Chat open/reuse
→ existing server authority available once an exact Reader is supplied

canonical Character → named/styled browser presentation
→ separately blocked by SRC-36
```
