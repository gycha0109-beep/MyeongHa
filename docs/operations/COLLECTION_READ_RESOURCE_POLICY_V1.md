# MyeongHa Collection Read Resource Policy V1

Status: **APPROVED IMPLEMENTATION AUTHORITY**

Issue: `#647`

## Objective

Give every currently confirmed growing authenticated collection read a finite, server-owned per-request result bound **before PostgreSQL returns the full collection**.

Covered routes:

- `GET /api/chat/:threadId`
- `GET /api/life-record`
- `GET /api/memories`
- `GET /api/readings`

This policy governs read-resource shape only. It does not change ownership authority, record meaning, retention, or product-semantic ordering.

## Source gap and authority decision

The existing product/use-case/ERD material fixes deterministic ordering for Chat and Reading History and preserves existing Life Record / Memory ordering, but it does **not** define a numeric page-size ceiling.

Therefore V1 does not pretend that a number came from a product source. This document is the explicit repository-owned operations/resource authority required by #647.

V1 chooses one uniform ceiling:

```text
default page size = 50 rows
maximum page size = 50 rows
minimum explicit page size = 1 row
```

Rationale:

1. the purpose is a finite per-request PostgreSQL/materialization/serialization bound, not an estimate of normal user history;
2. one shared ceiling avoids route-specific guessed numbers with no source basis;
3. 50 rows is large enough for existing first-load browser surfaces while forcing growing histories onto deterministic pages;
4. any change to the ceiling is a policy change and must update this versioned authority and regression tests before implementation.

Clients may request `pageSize=1..50`. Omission means 50. Values outside the range fail closed; the server never clamps a larger request silently.

## Authoritative route contracts

### Chat thread stream

```text
route      = GET /api/chat/:threadId
cursor     = afterSequenceNo, non-negative safe integer
ordering   = sequence_no ASC
pageSize   = optional 1..50, default 50
DB query   = requested pageSize + 1 rows maximum
```

The existing sequence cursor remains the authority. The response derives `hasMore` from the extra row and exposes the next sequence cursor without querying the remaining history.

### Life Record

```text
route      = GET /api/life-record
cursor     = opaque keyset cursor v1
ordering   = confirmed_at DESC, created_at DESC, id ASC
pageSize   = optional 1..50, default 50
DB query   = requested pageSize + 1 rows maximum
```

The ordering is intentionally preserved exactly; this policy does not reinterpret Life Fact history.

### Memories

```text
route      = GET /api/memories
cursor     = opaque keyset cursor v1
ordering   = created_at DESC, id DESC
pageSize   = optional 1..50, default 50
DB query   = requested pageSize + 1 rows maximum
```

### Reading History

```text
route      = GET /api/readings
cursor     = opaque keyset cursor v1
ordering   = completed_at DESC, created_at DESC, id DESC
pageSize   = optional 1..50, default 50
DB query   = requested pageSize + 1 rows maximum
```

The V1 implementation must preserve the current Official Reading / Reader provenance projection.

## Opaque cursor V1

Life Record, Memories, and Reading History use a server-issued base64url JSON cursor with an exact bounded schema.

The cursor carries:

```text
v                = 1
collection       = exact collection key
subjectBinding   = SHA-256("myeongha-collection-cursor-v1:" + canonical subject id)
order tuple      = only the exact stored ordering columns required by that collection
```

Rules:

- the cursor is an untrusted position token, never authentication or ownership authority;
- the current request is authenticated and canonical-subject scoped independently;
- `subjectBinding` must equal the current canonical subject binding;
- a cursor for another collection, another subject, wrong version, malformed timestamp/UUID, duplicate query parameter, unknown query parameter, or malformed base64/JSON fails closed with `INVALID_REQUEST`;
- cursor material never broadens owner scope;
- no offset pagination;
- no caller-provided subject id;
- no durable cursor/session table.

## Page response contract

Each covered response exposes page metadata:

```ts
{
  pageSize: number;      // number requested after defaulting, 1..50
  hasMore: boolean;
  nextCursor: string | null;
}
```

Chat may represent its next cursor as the authoritative next `afterSequenceNo` number rather than the opaque cursor used by the other collections.

`hasMore` is derived from fetching at most `pageSize + 1` rows in PostgreSQL. The application must not fetch the full remaining collection merely to calculate it.

## Database enforcement

Every covered DB read authority introduced for V1 must:

- accept the page size as an explicit parameter;
- reject values outside `1..50`;
- apply the keyset predicate before ordering/limit;
- execute `LIMIT pageSize + 1` or an equivalent finite plan;
- preserve canonical-subject ownership constraints;
- preserve the existing deterministic ordering exactly.

Node may drop the extra row after deriving `hasMore`; Node must not implement the primary bound by fetching an unlimited result and slicing it.

## Compatibility

Pagination is a resource-bound contract change. Affected route API contract metadata must advance rather than pretending the old unbounded response contract is unchanged.

Browser clients may continue presenting the same user-visible history by following server-issued pages, but every individual server request remains bounded.

A browser paginator must fail closed if a server cursor does not advance. It must not invent a cursor from local sort order.

## Non-goals

This policy does not define:

- request-frequency rate limits;
- maximum total rows a user may own;
- retention / TTL;
- record schema registries;
- notification inbox pagination;
- arbitrary offset/page-number pagination;
- a global maximum number of pages a user may request.

Those are separate authorities.

## Acceptance gate

V1 implementation is complete only when tests prove:

- all four PostgreSQL authorities are finite before rows leave PostgreSQL;
- `pageSize > 50`, zero, negative, non-integer, duplicate, and malformed values fail closed;
- page boundaries have no duplicate or omitted rows;
- keyset ordering is stable on tie columns;
- malformed/cross-collection/cross-subject opaque cursors fail closed;
- ownership remains canonical-subject scoped;
- `hasMore` comes from at most `pageSize + 1`;
- exact-head CI passes;
- Production verification on the exact deployed revision proves the bounded route contract without creating a large Production dataset.

Watchtower-Track: ops
