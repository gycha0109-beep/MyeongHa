# @myeongha/mobile

MyeongHa Mobile is a first-class React Native client of the existing MyeongHa server world.

## Current state

- Track: `applizing`
- Phase: **M9-A Push registration plumbing + M4-E Target Person create + M11-A4 hardening**
- Runtime: **Expo SDK 57 / React Native 0.86.x**
- Navigation: **Expo Router**
- Secure Guest credential persistence: **Expo SecureStore**
- Secure Member session foundation: **Expo SecureStore + server auth proxy**
- WebView wrapper: **not adopted**
- Web DOM/UI component reuse: **not adopted**
- Primary navigation: **Home / Saju / Chat / Records / My**
- Reading sub-navigation: **Saju(default) / Face**

## Current authority boundary

Mobile now has:

- Expo Router five-tab shell with Saju / Face secondary navigation;
- portable shared API/auth clients and Expo SecureStore Guest credential persistence;
- native Member sign-in/refresh/sign-out session foundation through the existing server auth proxy, with SecureStore persistence and fail-closed refresh handling;
- active-subject bearer routing that prefers a recoverable Member session and falls back to Guest only when no Member authority remains;
- existing-Member sign-in/sign-out from My, using the server auth proxy and ephemeral password input;
- native new-account creation with same-subject Guest→Member promotion; verification-required sign-up continues through the existing Web confirmation link, then returns to the app for sign-in + promotion;
- single-flight Guest bootstrap and concurrent 401 replacement recovery;
- current Birth Profile create/read, current-subject Saju calculation rendering, and source-authorized Preview Reading for the exact five approved topics;
- Records reads for Life Record, Reading History, and Memory with cursor pagination;
- owner-scoped Official Reading archive reread for completed stored Readings, using the same Product Reading safe display projection as Preview;
- My projection from current Profile + Birth;
- owner-scoped Target Persons list in My plus source-authorized create-only registration for Target metadata + Target Birth revision 1;
- Home projection composed from current Profile, Birth, latest Reading History, and calculation-only Saju evidence;
- known-thread Chat read through `GET /api/chat/:threadId` with forward cursor pagination and redaction-safe rendering;
- Member-only Chat open/reuse through `POST /api/chat` for the exact approved Launch 9 roster, with server-authoritative publication/availability and thread convergence;
- Face Reading camera/library photo staging through Expo ImagePicker with image-only selection, 16MB client bound, local preview, and no server analysis;
- source-authorized Expo Push Device Installation registration/refresh/rebind/revoke plumbing with SecureStore installation identity, user-initiated OS permission request, startup no-prompt sync, and account-switch fail-closed revoke;
- release-readiness preflight with iOS buildNumber / Android versionCode sequencing and fail-closed platform identity checks;
- release-only API origin guard that requires the canonical Production origin and rejects staging/local overrides while preserving flexible development runtime configuration;
- CI export smoke for both Android and iOS from the same Expo source, using isolated output directories after release preflight;
- post-export artifact verification requiring parseable metadata plus non-empty platform-correct Hermes bundles for both targets.

Home does not invent a separate server authority. It does not call unimplemented `/api/home` or `/api/characters`, does not infer a recent Chat thread, does not auto-run Preview Reading, and does not synthesize daily-fortune claims from calculation-only Saju evidence. Preview Reading is user-triggered only from the Saju surface.

Still gated after M3-B / M11-A4:

- full account management and Guest→existing-Member merge; existing-member merge remains blocked by SRC-24;
- Chat thread discovery / recent-thread listing;
- Chat send;
- Target Person post-create metadata edit, deletion, birth correction, and Compatibility execution;
- production Character catalog/recommendation projection;
- Face Reading engine intake / analysis upload. M7 does not treat `exif: false` as proof that selected file bytes are metadata-stripped;
- notification sending/provider routing and autonomous scheduling remain blocked by SRC-31 / SRC-32; M9-A only registers, refreshes, rebinds, and revokes the current device;
- native store commerce;
- signed store distribution still requires external Apple/Google developer-account and signing authority; production app identity is fixed to `com.myeongha.app` on both platforms.

## Commands

```bash
npm run start -w @myeongha/mobile
npm run android -w @myeongha/mobile
npm run ios -w @myeongha/mobile
npm run typecheck -w @myeongha/mobile
npm run typecheck -w @myeongha/api-client
```


## Release readiness

```bash
npm run verify:mobile-release-readiness
```

The strict command now validates the approved production identity `com.myeongha.app` on both platforms together with version sequencing and the canonical Production API origin.

CI uses:

```bash
npm run verify:mobile-release-readiness-contract
```

That mode still fails on malformed release configuration and any non-canonical `EXPO_PUBLIC_MYEONGHA_API_ORIGIN`, but allows the two documented source-owned identity blockers to remain unresolved while Mobile implementation work continues.
