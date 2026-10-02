# Mobile Release Readiness v1

> Track: `applizing`  
> Status: **M11-A4 IMPLEMENTED / PLATFORM IDENTITY READY / SIGNING EXTERNAL**  
> Date: **2026-10-02**

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

The repository now has an executable preflight:

```bash
npm run verify:mobile-release-readiness
```

The permanent platform application identities are now explicitly approved and configured:

```text
expo.ios.bundleIdentifier = com.myeongha.app
expo.android.package      = com.myeongha.app
```

The strict release-readiness command therefore passes for repository-owned application
identity and API-origin checks. Apple/Google signing credentials remain external.

## Push activation is a separate gate

General Mobile release identity is no longer blocked by package/bundle identifiers.
Push activation has its own executable preflight because it additionally depends on
external Expo/EAS and Production secret configuration:

```bash
npm run verify:mobile-push-activation-readiness
```

See `docs/MOBILE_PUSH_ACTIVATION_READINESS_V1.md`.

## CI behavior

```bash
npm run verify:mobile-release-readiness-contract
```

The CI contract mode remains available for structural verification. The current repository
has no platform-identity blockers; structural violations and non-canonical release API
origin overrides still fail.

Mobile PR CI also runs the Push activation contract preflight. That check permits only
external Push activation blockers while rejecting structural or malformed configuration.

## Out of scope

M11-A does not authorize or configure:

- Apple Developer / Google Play account ownership;
- signing certificate / provisioning profile / keystore material;
- store listing identifiers or metadata;
- EAS project ownership and the real EAS project UUID;
- OTA update policy;
- native/platform Push credentials and server Push token-protection secrets;
- Apple IAP / Google Play Billing;
- production distribution.


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
bundles without claiming signed-store readiness. Permanent platform identities
and signing material remain separate blockers.


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
