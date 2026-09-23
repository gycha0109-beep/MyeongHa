# SRC-37 — Persisted Reading Reader Re-entry Selection Authority

> Status: **RESOLVED / RECORDS ARCHIVE PATH IMPLEMENTED**  
> Domain: Reading / Reader / Records

## 1. Product decision

A persisted Saju result is reopened from **Records as the stored Official Reading result**. Reopening a record does not re-enter a Reader Scene and does not choose a Reader for Chat.

Reader-held knowledge/context and the Records copy of the Saju result are separate concerns.

The Records experience is a history/archive surface. Each item should communicate:

```text
who it was read with · when it was read · what Saju product/domain it was
```

Opening that item reads the stored Official Reading result. It does not manufacture `readerCharacterId`, does not select first/latest/default Reader, and does not derive a Chat `threadId`.

## 2. Approved Records chain

```text
Records history
→ persisted Official Reading identity
→ owner-authorized stored Official Reading detail
```

The former Records requirement:

```text
Records → exact Reader selection → Reader Preview → Chat
```

is retired.

Reader knowledge remains available only through Reader/Character runtime authority and its own access/context rules.

## 3. Reader attribution in the list

Reader attribution is display provenance, not re-entry authority. It must come from server-owned purchase/access provenance for the stored Reading. If more than one Reader has provenance for one Official Reading, the projection must represent that provenance without arbitrarily choosing one row.

## 4. Implemented authority path

The Records archive path now has explicit runtime authority:

- `public.qry_reading_history_v2` returns succeeded Official Reading metadata plus bounded Reader display provenance;
- `public.qry_official_reading_record_runtime_v1` returns the owner-scoped stored admitted ProductReadingResponse without Reader selection;
- `GET /api/readings` serves history;
- `GET /api/readings?readingId=<uuid>` serves one stored Official Reading;
- the browser verifies `readingId`, `readingSessionId`, and `sajuDomain` against the validated Records handoff before rendering;
- persisted reread hides Reader Scene/Reader commentary and renders the stored Official Reading as a Records archive surface.

Reader provenance is display-only and never becomes Reader/Chat authority.

## 5. Prohibited regressions

- do not reopen Records through Reader Scene;
- do not require a Reader selection merely to reread the stored Saju result;
- do not use `readingId` or `readingSessionId` as Chat `threadId`;
- do not infer a Reader from URL/local/session storage, Saju domain, catalog order, or a default Character;
- do not merge Reader memory/context storage with the Records Official Reading artifact.
