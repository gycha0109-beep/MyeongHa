# MyeongHa Mobile Client Architecture v1

> Track: `applizing`  
> Status: M5 Home projection composition implemented  
> Date: 2026-09-29  
> Server authority: existing MyeongHa API / PostgreSQL  
> Client principle: Web and Mobile are separate first-class clients of the same server world.

## 1. Decision summary

The mobile client is a separate React Native client, not a WebView wrapper and not a direct reuse of Web DOM components.

Planned runtime baseline:

- Expo SDK 57 stable
- React Native 0.86.x
- Expo Router
- TypeScript strict
- Android + iOS from one mobile codebase
- server-authoritative product state
- mobile-local state limited to presentation, cache, draft, and platform integration state

Runtime dependency activation is deferred to M1 so `apps/mobile/package.json` and the root lockfile can be changed atomically.

## 2. Product navigation contract

Primary bottom navigation has exactly five destinations, in this order:

```text
Home
Saju
Chat
Records
My
```

The user-facing **Saju** primary tab is a Reading hub.

```text
Saju primary tab
├─ Saju     (default)
└─ Face     (secondary tab)
```

Rules:

1. Entering the Saju primary tab opens the Saju subtab by default.
2. Face Reading is never a sixth primary bottom tab.
3. A Face deep link keeps the Saju primary tab selected.
4. Re-selecting the Saju primary tab resets to the Saju default screen.
5. Saju and Face Reading remain separate semantic authorities even though they share a mobile navigation container.

## 3. Authority boundary

```text
Server = authority
Mobile = cache + presentation + drafts + native adapters
```

The mobile client must not independently finalize:

- relationship score/stage
- memory persistence or grants
- character unlock
- Reading final result
- entitlement
- canon transition
- payment success => entitlement

## 4. Client layering

```text
Screen
  ↓
Feature controller / hook
  ↓
Use case
  ↓
Repository
  ↓
Shared API client
  ↓
HTTP transport
  ↓
MyeongHa API
```

Platform-specific integrations sit beside product features rather than inside domain logic:

```text
platform/
├─ secure-storage
├─ notifications
├─ media
├─ deep-link
├─ lifecycle
└─ commerce
```

## 5. Planned route topology

```text
src/app/
├─ _layout.tsx
├─ (tabs)/
│  ├─ _layout.tsx
│  ├─ index.tsx
│  ├─ reading/
│  │  ├─ _layout.tsx
│  │  ├─ index.tsx
│  │  └─ face.tsx
│  ├─ chat/index.tsx
│  ├─ records/index.tsx
│  └─ my/index.tsx
├─ chat/[threadId].tsx
├─ reading/[readingId].tsx
├─ birth/
├─ face-reading/
├─ notifications/
├─ relationship/
├─ memories/
└─ settings/
```

Non-navigation product code remains outside the Expo Router app directory.

## 6. Shared vs platform-specific code

Shared:

- API DTO/contracts
- bounded enums and identifiers
- validation
- pure domain rules
- API client
- platform-neutral design tokens
- test fixtures

Not shared:

- Web HTML/CSS
- DOM components
- `window` / `document` runtime
- browser storage adapters
- mobile navigation implementation
- native animation/media/push implementations

## 7. Feature readiness constraints

### Saju

Current Birth Profile and Saju calculation runtime can be consumed by Mobile once the shared API client and auth adapters are available.

Calculation-only facts and authoritative Reading output remain distinct.

### Face Reading

Face Reading lives under the Saju primary tab but remains a separate feature/repository/engine authority.

Native media capture can be prepared independently, but the client must not invent a production upload/API contract before source authority is available.

### Chat

Current Production state permits read-oriented mobile scaffolding only where server authority exists.

Mobile must not locally commit synthetic assistant/user turns when server send/thread-creation authority is blocked.

### Records / My

These can reuse the existing server-owned user-data surfaces through shared API bindings.

### Notifications / Commerce

Native adapters may be scaffolded, but activation remains gated by their server/source authority.

## 8. Offline and replay policy

Allowed locally:

- tab state
- UI preferences
- input drafts
- chat drafts
- read cache

No silent offline mutation replay for:

- chat send
- Reading creation
- relationship mutation
- memory grant/revoke
- commerce
- account deletion

Server idempotency/revision contracts remain mandatory.

## 9. Delivery phases

```text
M0  architecture foundation + navigation contract       DONE
M1  Expo runtime bootstrap + five-tab shell              DONE
M2  shared API/auth + secure credential adapter          DONE
M3  Saju + Birth vertical slice                          DONE
M4  Records + My                                         DONE
M5  Home projection composition                          DONE
M6  Chat Hub + server-authorized read path               NEXT
M7  Face Reading media path
M8  Chat send after authority unblock
M9  Push after notification authority unblock
M10 native store commerce after rail decision
M11 Android/iOS release hardening
```

## 10. M0 acceptance criteria

M0 is complete when:

- the five-primary-tab contract is executable and tested;
- Face Reading cannot appear as a primary tab;
- Saju is the default Reading subtab;
- Face routes resolve to the Saju primary tab;
- the mobile README no longer describes the app as an undefined future placeholder;
- no Expo dependency is partially added without a synchronized lockfile update.


## 11. M5 Home projection boundary

The Mobile Home screen is a client-side presentation composition over existing owner-scoped authorities:

```text
GET  /api/me
GET  /api/me/birth-profile
GET  /api/readings?pageSize=1
POST /api/me/saju/calculation   # only when current Birth exists
```

M5 invariants:

- Home is not a new canonical aggregate and does not persist a Home state.
- `/api/home` remains unused until a Production route/runtime exists.
- no Character recommendation or static roster is promoted into Mobile authority.
- no Chat continuation is inferred without a server-authorized thread-list/discovery projection.
- the Saju card exposes calculation facts only; it cannot synthesize daily-fortune claims.
- Reading topic tiles are presentation-only and do not auto-execute Preview Reading.
- current Birth revision and Saju `birthRevisionRef` must match before calculation facts are shown.
- Home cache is process-memory presentation state only; SecureStore remains credential-only.
