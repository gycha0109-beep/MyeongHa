# MyeongHa Mobile Client Architecture v1

> Track: `applizing`  
> Status: M4-D Official Reading reread + M3-B Preview + M11-A4 hardening implemented  
> Date: 2026-10-01  
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

Current Birth Profile and Saju calculation runtime are consumed by Mobile through shared API/auth adapters.

Calculation-only facts and authoritative Reading output remain distinct. Mobile may invoke only the current Production Preview Reading boundary for the exact five server-approved texts and may render only the consumer-safe ProductReadingResponse v2 presentation projection.

### Face Reading

Face Reading lives under the Saju primary tab but remains a separate feature/repository/engine authority.

Native media capture can be prepared independently, but the client must not invent a production upload/API contract before source authority is available.

### Chat

Current Production state permits known-thread read plus Member single-Character open/reuse for the exact approved Launch 9 canonical ids.

Mobile may present only the source-approved Launch membership, canonical ids, and official display names for this selector. Publication/availability and thread creation/reuse remain server-authoritative. Guest open, recent-thread discovery, detailed Character catalog content, and Chat send remain blocked unless separately authorized.

Mobile must not locally commit synthetic assistant/user turns.

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
M2-B Guest→new Member same-subject enrollment             DONE
M3  Saju + Birth vertical slice                          DONE
M3-B source-authorized Saju Preview Reading               DONE
M4  Records + My                                         DONE
M4-E Target Persons read-only projection                  DONE
M4-D Official Reading archive reread                       DONE
M5  Home projection composition                          DONE
M6  Chat Hub + server-authorized read path               DONE
M7  Face Reading media path                              DONE
M8-A Member Chat open/reuse + exact Launch roster         DONE
M8-B Chat send after authority unblock                    BLOCKED
M9  Push after notification authority unblock             BLOCKED
M10 native store commerce after rail decision             NOT IN LAUNCH RAIL
M11-A Android/iOS release-readiness preflight             DONE
M11-A2 Production API origin release guard                DONE
M11-A3 Android+iOS Expo export smoke                       DONE
M11-A4 Export artifact structure verification              DONE
M11-B production app identity + signed store builds       BLOCKED
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
- M6 itself does not invent recent-thread discovery or Character browsing; later source-authorized phases may add narrower surfaces without changing the M6 read contract.
- Character names/titles/portraits are not inferred from `characterId`.
- forward stream pagination is preserved; Mobile does not claim to have the latest message until it has traversed the available forward pages.
- redacted message body/payload content is never rendered.
- relationship data stays server-owned; M6 does not locally mutate or score it.
- no input composer or Chat-send mutation is activated by M6; Member Chat-open is added separately by M8-A.


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


## 14. M8-A Member Chat open/reuse boundary

M8-A activates the existing Member-only server command:

```text
POST /api/chat
Authorization: Bearer <Member session>
Content-Type: application/json

{ "characterId": "<approved Launch Character id>" }
```

The selectable identities are exactly:

```text
seyeon   세연
yeoul    여울
seorin   서린
rahyeon  라현
mira     미라
taegyeom 태겸
yunho    윤호
doyun    도윤
baekheon 백헌
```

M8-A invariants:

- Guest Chat open remains disabled.
- Mobile sends exactly one authority-bearing request field: canonical `characterId`.
- the client does not send subject, release, bundle, presentation key, thread candidate ids, or idempotency keys.
- the selector exposes only source-approved Launch membership + exact canonical id + official display name; it does not invent detailed Character canon, title, portrait, recommendation, or availability state.
- the server remains authoritative for active Member eligibility, publication/availability, current default release/bundle, existing-thread reuse, new-thread creation, and concurrency convergence.
- successful open/reuse navigates to the existing known-thread read surface.
- recent-thread discovery remains unavailable.
- Chat send remains disabled.


## 15. M11-A release-readiness preflight

M11-A adds a repository-owned release guard without inventing permanent store identities.

Current release sequencing is explicit:

```text
Expo app version      = 0.1.0
iOS buildNumber       = 1
Android versionCode   = 1
```

Strict release readiness additionally requires:

```text
ios.bundleIdentifier
android.package
```

Those two values are long-lived platform application identities. The current source/repository does not authorize their exact values, so M11-A deliberately leaves them unset and reports them as blockers instead of deriving them from the GitHub owner, Vercel hostname, Expo slug, or product display name.

M11-A invariants:

- app and package semantic versions must match;
- iOS buildNumber must be a positive integer string;
- Android versionCode must be a positive integer;
- configured platform ids must be valid reverse-DNS identifiers;
- strict release verification fails while either platform identity is absent;
- CI contract verification may continue while those exact documented identity blockers remain unresolved;
- malformed release configuration always fails CI;
- M11-A does not configure signing credentials, Apple/Google developer accounts, store listing metadata, OTA update authority, or native payment rails.


## 16. M11-A2 Production API origin release guard

Development runtime configuration remains intentionally flexible:

- HTTPS API origin overrides are permitted for governed development/staging use.
- local/private HTTP origins are permitted only for development networks.

Release verification is stricter. The effective build-time value of
`EXPO_PUBLIC_MYEONGHA_API_ORIGIN` must resolve to the canonical Production
origin:

```text
https://myeongha.vercel.app
```

If the variable is absent, Mobile uses that canonical default. If it is present,
release preflight rejects:

- any different HTTPS origin;
- localhost/private HTTP origins;
- credentials;
- path components;
- query strings;
- fragments.

This guard is release-only and does not remove the existing development runtime
override behavior. The runtime constant and release-preflight constant are
cross-tested to prevent silent authority drift.


## 17. M11-A3 Android+iOS Expo export smoke

Mobile PR CI now exports both supported client platforms after release preflight:

```text
Android -> apps/mobile/.expo/export-ci/android
iOS     -> apps/mobile/.expo/export-ci/ios
```

M11-A3 invariants:

- Android and iOS export commands are explicit and independently addressable;
- output directories are isolated so one platform cannot hide or overwrite the other's export result;
- release-readiness contract verification runs before either export;
- this is an unsigned Expo export smoke, not an Apple/Google signed store build;
- no bundle identifier, Android package id, signing credential, provisioning profile, keystore, EAS ownership, or store account is invented;
- a platform export failure blocks the Mobile PR bundle gate.


## 18. M11-A4 export artifact verification

M11-A4 verifies the concrete outputs produced by the M11-A3 Expo export smoke.

Expected per-platform shape:

```text
apps/mobile/.expo/export-ci/<platform>/
├─ metadata.json
└─ _expo/static/js/<platform>/entry-*.hbc
```

The verifier requires:

- a non-empty, parseable JSON object at `metadata.json`;
- at least one non-empty Hermes `.hbc` bundle under the matching platform path;
- no Hermes bundle under the opposite platform path inside that platform's export root.

The checks run after both Expo exports and block the Mobile PR bundle gate on malformed,
missing, empty, or cross-platform-contaminated artifacts.

M11-A4 does not claim signed native binary readiness. APK/AAB/IPA production signing and
store distribution remain gated by M11-B.


## 19. Native new-member enrollment boundary

Mobile may create a new Supabase authentication identity and promote the current
Guest subject to that new Member identity through the existing Production
authority:

```text
POST /api/auth/sign-up
POST /api/auth/promote-guest
```

Enrollment invariants:

- generic existing-account sign-in never calls Guest promotion;
- the Member session returned by sign-up/sign-in is not persisted until Guest
  promotion succeeds;
- Guest promotion sends the verified Member bearer plus the current opaque Guest
  bearer and an empty JSON body;
- the promotion response subject id must equal the current Guest subject id;
- only after promotion succeeds is the Member session persisted;
- the consumed Guest credential is then removed best-effort from device storage;
- `verification_required` preserves the Guest session and stores no Member
  session; the app persists only a pending enrollment marker containing the
  normalized email plus the original Guest subject/session ids, never the
  password or a duplicate Guest bearer;
- after app restart, completion may resume only when the current stored Guest
  still matches that pending subject/session and remains unexpired;
- the user completes the existing Web confirmation link and returns to the app
  to sign in and finish promotion;
- `GUEST_MERGE_REQUIRED` is surfaced as a blocked existing-member merge. Mobile
  does not invent SRC-24 conflict/resolution semantics;
- passwords remain ephemeral screen state and are never persisted.


## 20. M3-B Saju Preview Reading boundary

Mobile exposes the existing Production current-subject Preview Reading endpoint:

```text
POST /api/me/saju/preview-reading
Authorization: Bearer <active Guest or Member subject>
Content-Type: application/json

{ "readingText": "<approved Preview text>" }
```

The selectable request texts are exactly:

```text
전체 사주
직업운
재물운
연애운
사업운
```

The presentation parser is pinned to the Saju public ProductReadingResponse v2
contract reviewed at Saju source SHA:

```text
19095a89773d517c2b6d69c45544525b9262459a
```

M3-B invariants:

- the client never sends Birth input, lifecycle, Saju domain, profile, Character,
  or other semantic authority fields;
- current Birth revision binding and governed interpretation execution remain
  server-owned;
- only `delivered` and `delivered_with_fallback` responses render Reading text;
- other ProductReadingResponse states produce neutral availability/clarification
  UI and are never converted into fortune meaning;
- the Mobile parser accepts only the public ProductReadingResponse block types
  already consumed by the current Web Preview surface;
- unavailable sections are omitted rather than replaced;
- Preview notice sections and disclosures are preserved;
- raw response JSON, internal claim ids, methodology state, research authority,
  or unsupported fields are never shown;
- Mobile does not add Character voice, advice, fortune scores, daily fortune, or
  missing interpretation text;
- Preview execution is explicit user action on the Saju screen; Home remains
  calculation-only and never auto-runs Preview Reading.


## 21. M4-D Official Reading archive reread boundary

Mobile Records may reopen an owner-scoped stored Official Reading only through:

```text
GET /api/readings?readingId=<canonical UUID>
Authorization: Bearer <active Guest or Member subject>
```

The server archive authority exposes only execution-successful records whose
Product response state is:

```text
delivered
delivered_with_fallback
```

M4-D invariants:

- Reading History remains a list authority; only archive-openable states receive
  a detail navigation action;
- Mobile validates the requested Reading id as a UUID before network execution;
- returned Reading id, Reading Session id, Saju domain, response state, contract
  version, Reader provenance, and completed timestamp are revalidated;
- the stored ProductReadingResponse snapshot must match the record's Reading id,
  response contract version, and product response state;
- the raw stored snapshot never leaves the shared API client result type;
- the archive uses the same ProductReadingResponse v2 safe display projector as
  current Preview Reading;
- response hashes and internal archive provenance are not projected to Mobile;
- Reader Character ids are not converted into invented names, portraits, or
  continuation authority;
- archive reread never starts Chat, mutates Records, or creates a new Reading;
- a missing/not-owner/non-openable record fails closed instead of falling back
  to current Preview or another Reading.


## 20. M4-E Target Persons read-only projection

Mobile My may read the current subject's existing Target Persons through:

```text
GET /api/target-persons
```

M4-E invariants:

- the active Member/Guest subject bearer is the only client identity evidence;
- Mobile never sends a subject id in query/body data;
- Target Person ids, Birth Profile ids, and current revision ids are validated as UUIDs;
- duplicate Target Person or Birth Profile identities fail closed;
- only the server-returned display label, relationship label, and current Birth revision input are rendered;
- Target Person create, edit, deletion, birth correction, comparison, compatibility scoring, or Reading execution are not activated;
- My Profile and self Birth remain usable when the Target Person read independently fails.
