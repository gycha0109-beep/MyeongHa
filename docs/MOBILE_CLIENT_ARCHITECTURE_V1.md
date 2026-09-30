# MyeongHa Mobile Client Architecture v1

> Track: `applizing`  
> Status: M8 prerequisite — existing-Member auth foundation implemented  
> Date: 2026-09-30  
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
│  ├─ chat/
│  │  ├─ _layout.tsx
│  │  ├─ index.tsx
│  │  └─ [threadId].tsx
│  ├─ records/index.tsx
│  └─ my/index.tsx
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

Current Production authority supports known-thread read and the narrow Member + Launch-9 single-Character thread open/reuse command.

Mobile currently activates only the known-thread read path. Member thread open still requires native Member-session integration plus a server-authorized Character discovery/presentation path. Chat turn-send remains separately blocked because the current Member thread-open authority does not define a replacement send HTTP contract.

Mobile must not locally commit synthetic assistant/user turns or infer a turn-send request from the obsolete generic API example.

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
M6  Chat Hub + server-authorized read path               DONE
M7  Face Reading media path                              DONE
M8  Chat send after authority unblock                    BLOCKED
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


## 12. M6 Chat read boundary

Mobile Chat now supports a known owner-scoped thread read:

```text
GET /api/chat/:threadId?afterSequenceNo=<n>&pageSize=<1..50>
```

M6 invariants:

- a thread id must already come from a server-authorized link or future discovery projection; Mobile does not invent a thread list.
- Chat Hub remains an authority-safe blocked surface for recent-thread discovery and Character browsing.
- Character names/titles/portraits are not inferred from `characterId`.
- forward stream pagination is preserved; Mobile does not claim to have the latest message until it has traversed the available forward pages.
- redacted message body/payload content is never rendered.
- relationship data stays server-owned; M6 does not locally mutate or score it.
- no input composer, Chat-open mutation, or Chat-send mutation is activated by M6.


## 13. M7 Face media staging boundary

M7 adds the native photo staging path under the existing Saju primary tab / Face secondary tab:

```text
Expo ImagePicker 57.0.20
├─ front-camera capture
└─ system image-library selection
```

M7 media rules:

- image media only;
- one asset at a time;
- JPEG / PNG / WebP when MIME metadata is available;
- 16 MiB client-side size bound when file-size metadata is available;
- no Base64 projection;
- no EXIF object projection into JavaScript;
- microphone permission is explicitly disabled for this photo-only path;
- selected URI/dimensions/size stay in ephemeral screen state only;
- no SecureStore / AsyncStorage / Records persistence;
- no `fetch`, `FormData`, upload, analysis request, or Face semantic generation.

Important privacy boundary:

`expo-image-picker` with `exif: false` only means EXIF data is not returned in the picker result. M7 does **not** treat that option as evidence that metadata has been stripped from the selected file bytes. The Face Reading engine authority requires EXIF/metadata removal at intake, so engine handoff remains disabled until a source-approved intake adapter explicitly satisfies that requirement.

M7 therefore completes the **native media staging** path without inventing a Production Face Reading upload/API contract or bypassing the separate Face Reading engine authority.


## 14. M8 prerequisite A — existing-Member authentication

Before Mobile can consume the already-authorized Member-only Chat thread-open path, it needs a native Member session authority distinct from the Guest credential.

Implemented prerequisite:

```text
POST /api/auth/sign-in
POST /api/auth/refresh
POST /api/auth/sign-out
        ↓
shared strict Member session parser
        ↓
Expo SecureStore Member session key
        ↓
single-flight proactive refresh
+ serialized sign-in / refresh / sign-out mutation ordering
```

Rules:

- Member and Guest credentials use separate SecureStore keys.
- existing-Member sign-in does not silently clear, merge, or promote the current Guest authority.
- refresh-token rotation is persisted as one Member session generation.
- stale refresh completion cannot intentionally overwrite a newer explicit sign-in generation inside the native coordinator.
- an authoritative `SESSION_EXPIRED` refresh rejection clears only the expected Member generation.
- transient proactive-refresh failure may continue using the still-unexpired access token.
- sign-out is local-device authoritative after best-effort server sign-out, matching the existing Web authority pattern.
- the foundation does not activate Chat open, Chat send, Character discovery, or a static Character roster.

Mobile sign-up is intentionally not activated by this prerequisite. The current server sign-up path generates an email confirmation redirect to the governed Web `/auth.html` flow. A native confirmation/deep-link handoff contract must be established before Mobile can claim a complete sign-up lifecycle.

### M8 send blocker

The current Production `POST /api/chat` contract is the Member Launch-Character **thread open/reuse** command. `CHAT_MEMBER_THREAD_OPEN_HTTP_AUTHORITY_V1` explicitly states that it does not define a replacement turn-send HTTP contract. Therefore M8 Chat send remains blocked; Mobile must not reuse the obsolete API-contract example or invent `clientCapability`/turn-send transport semantics.
