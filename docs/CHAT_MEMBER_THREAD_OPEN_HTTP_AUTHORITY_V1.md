# Member Character Thread Open HTTP Authority V1

> Status: **CURRENT PRODUCT / HTTP AUTHORITY**  
> Date: **2026-09-06**  
> Scope: Member single-Character thread open/reuse only

## 1. Authority precedence

This document records the 2026-09-06 Product Owner decisions already implemented by `0970_member_character_thread_open_runtime_authority.sql` and is the current authority for the Member MVP `POST /api/chat` open/reuse path.

For this narrow scope it **supersedes the older `docs/API_CONTRACT.md` §5 `chat → clientTurnId` entry and §9 `POST /api/chat` turn-send request shape**. Those older passages do not authorize the current Member thread-open request and must not be used to infer client-owned thread/content authority.

This override does **not** define a replacement HTTP contract for sending a chat turn. Turn execution/retry/abandon semantics remain separately governed and are not silently remapped onto this Member thread-open command.

## 2. Request

```http
POST /api/chat
Authorization: Bearer <Member session>
Content-Type: application/json
```

```json
{
  "characterId": "<canonical Character id>"
}
```

Normative rules:

- `characterId` is the canonical Character identity consumed by the governed DB command.
- The request object contains exactly `characterId` for V1.
- The server resolves the canonical Member subject from verified request identity.
- Caller-supplied `subjectId`, `releaseId`, `bundleId`, `presentationKey`, thread candidate IDs, or other authority-bearing fields are rejected fail-closed.
- No `presentationKey → characterId` mapping may be guessed. A UI presentation key may be used only after a separate source-backed canonical mapping exists.
- Guest create/open is not authorized by this contract.

## 3. Command boundary

The HTTP adapter delegates create/reuse to:

```text
public.cmd_open_member_single_character_thread_v1
```

The server supplies:

1. canonical resolved Member `subject_id`
2. requested canonical `character_id`
3. server-generated candidate thread UUID
4. server-generated candidate thread-character UUID

The DB command remains authoritative for:

- active Member eligibility
- active default content release selection
- active content bundle selection
- Character publication/availability
- existing active single-Character thread reuse
- new thread creation and pinned release/bundle
- retry/concurrency convergence
- malformed pre-existing active-thread state fail-closed behavior

The HTTP adapter must not directly `INSERT` Chat thread/participant rows.

## 4. Response

```json
{
  "ok": true,
  "data": {
    "threadId": "<uuid>",
    "characterId": "<canonical Character id>",
    "created": true
  },
  "meta": {
    "apiContractVersion": "v0.9",
    "requestId": "<server request id>",
    "serverTime": "<timestamp>"
  }
}
```

`created=false` means an existing valid logical `(Member subject, Character)` thread was reused.

The public response does not expose canonical subject UUID, pinned release UUID, pinned bundle UUID, access token, refresh token, or other private authority material.

All responses are `Cache-Control: no-store`.

## 5. HTTP failure projection

| Condition | HTTP / code |
|---|---|
| missing or invalid verified identity | `401 AUTH_REQUIRED` |
| invalid/extra/authority-injecting request body | `400 INVALID_REQUEST` |
| Guest or inactive/deletion-pending Member | `403 FORBIDDEN` |
| Character unpublished/unavailable | `404 NOT_FOUND` |
| malformed incompatible existing active thread state | `409 CONTENT_INCOMPATIBLE` |
| active default release/bundle unavailable | `503 CAPABILITY_UNAVAILABLE` |

Database-private error messages and raw identifiers are not reflected to the client.

## 6. Idempotency / convergence

Member thread open does not use the older chat-turn `clientTurnId` identity.

Logical convergence is server/DB-authoritative:

```text
(canonical Member subject, canonical Character)
→ at most one active single-Character thread
→ existing valid thread: reuse
→ absent: create
→ concurrent/retried opens: converge through the governed DB command
```

No caller-controlled release/bundle/thread authority is introduced to manufacture idempotency.

## 7. Explicit non-authority

This document does not authorize:

- Guest thread create/open
- detailed Character Canon/Persona/Behavior publication
- Character content fixtures in Production
- turn-send request schemas
- client-controlled release/bundle/subject selection
- `presentationKey` as a canonical DB Character id

Production positive smoke requires real approved published Character content. Absence of eligible Production content is a blocker, not permission to insert arbitrary fixture rows.

## 8. SRC-34 closure boundary

Any earlier `SRC-34` OPEN-P0 statement about **Member single-Character thread open/create-or-reuse semantics** is superseded for this narrow path by the 2026-09-06 Product Owner decision, migration `0970`, and this HTTP authority.

This closure does not extend to chat turn-send request semantics, Guest create/open, Character content publication, or UI `presentationKey → characterId` mapping. Those remain separately governed and must not be inferred from this closure.
