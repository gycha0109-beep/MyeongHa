# Mobile Release Readiness v1

> Track: `applizing`  
> Status: **M11-A4 IMPLEMENTED / DEBUG APK HISTORY VERIFIED / STANDALONE PHYSICAL DEVICE ACCEPTANCE PENDING / SIGNING EXTERNAL**  
> Date: **2026-10-03**

## Production API origin guard

Release builds are bound to the existing canonical Production API origin:

```text
https://myeongha.vercel.app
```

Development may continue to use governed HTTPS overrides and local/private HTTP
origins. Release preflight is stricter: an explicit
`EXPO_PUBLIC_MYEONGHA_API_ORIGIN` must normalize to the canonical Production
origin or verification fails.

This prevents a store build from accidentally shipping against staging,
localhost, a private LAN address, or another HTTPS host.

## Current executable baseline

```text
Expo version        0.1.0
iOS buildNumber     1
Android versionCode 1
```

The repository has an executable preflight:

```bash
npm run verify:mobile-release-readiness
```

The permanent platform application identities are explicitly approved and configured:

```text
expo.ios.bundleIdentifier = com.myeongha.app
expo.android.package      = com.myeongha.app
```

The strict release-readiness command therefore passes for repository-owned application
identity and API-origin checks. Apple/Google store signing credentials remain external.

## Push activation is a separate gate

General Mobile release identity is not blocked by package/bundle identifiers.
Push Production activation has completed through the guarded activation workflow,
and the activated EAS project identity is now source-pinned and EAS-bound.

The executable preflight remains:

```bash
npm run verify:mobile-push-activation-readiness
```

See `docs/MOBILE_PUSH_ACTIVATION_READINESS_V1.md`.

## CI behavior

```bash
npm run verify:mobile-release-readiness-contract
```

The CI contract mode remains available for structural verification. Structural
violations and non-canonical release API origin overrides still fail.

Mobile PR CI also runs the Push activation contract and the Android physical-smoke
build contract.

## Android physical-smoke build evidence

The first successful no-store-signing Android physical-smoke build completed on
2026-10-03.

```text
EAS project      @johnny0109/myeongha-mobile
EAS project UUID 5c20243c-60a8-44f3-9d8c-ca06ccc8bebe
EAS build ID     2e5b3093-5f09-469a-a99d-38cc53e5f117
GitHub run       37098850829
Build profile    physical-smoke
Node             24.14.0
Gradle command   :app:assembleDebug
Credentials      withoutCredentials=true
Store submit     false
```

That 2026-10-03 artifact was an **assembleDebug** historical build, not an
offline-installable standalone release APK. A historical Actions job rerun on
2026-10-14 checked out stale commit `9013fe48` and built another debug APK.
The Android physical-device report on 2026-10-15 shows
`Unable to load script / LoadJSBundleFromAssets` (Metro unavailable or JS
bundle absent). Neither the old build PASS nor a GitHub rerun proves a
standalone, embedded-bundle APK works on a real phone.

The current `main` EAS `physical-smoke` profile already pins
`:app:assembleRelease`. The follow-up fix rejects stale job reruns before
EAS submission; it verifies non-debuggable APK metadata, ZIP integrity and
a nonempty embedded `assets/index.android.bundle` **before** upload, and
records the exact Git SHA and APK digest. A new workflow on current main,
NOT a rerun of the old successful job, is mandatory. The merge-triggered
fresh workflow's APK validation and actual on-phone launch must both pass
before standalone acceptance may be recorded.

The remaining release-readiness evidence is physical-device smoke:

1. install the successful Android artifact on a physical device;
2. launch the newly verified release-variant APK with Metro, USB and PC all disconnected;
3. explicitly enable Push from My;
4. verify Device Installation registration;
5. relaunch and verify no-prompt refresh;
6. verify logout revokes the binding;
7. verify re-login/rebind behavior.

Physical-device smoke is evidence work only. It does not authorize notification
sending, retry/failover, or scheduling.

## Out of scope

M11-A does not authorize or configure:

- Apple Developer / Google Play account ownership;
- production signing certificate / provisioning profile / keystore material;
- store listing identifiers or metadata;
- OTA update policy;
- Apple IAP / Google Play Billing;
- production store distribution;
- notification sending, retry/failover, or autonomous scheduling.

## Dual-platform export smoke

Mobile PR CI performs unsigned Expo exports for both supported platforms after the
release-readiness contract passes:

```bash
npm run export:ci:android -w @myeongha/mobile
npm run export:ci:ios -w @myeongha/mobile
```

The aggregate workspace command runs both in sequence:

```bash
npm run export:ci -w @myeongha/mobile
```

This verifies that the shared Expo application can produce both Android and iOS
bundles without claiming signed-store readiness.

## Export artifact verification

After the Android and iOS Expo exports complete, CI verifies the generated
artifacts rather than relying only on the exporter exit code.

For each platform it requires:

```text
metadata.json
_expo/static/js/<platform>/*.hbc
```

`metadata.json` must be non-empty and parse as a JSON object. At least one
Hermes bundle must exist and have non-zero size. A platform export must not
contain a Hermes bundle under the opposite platform path.

The command is:

```bash
npm run verify:mobile-export-artifacts
```
