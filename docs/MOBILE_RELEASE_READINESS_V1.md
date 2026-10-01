# Mobile Release Readiness v1

> Track: `applizing`  
> Status: **M11-A2 IMPLEMENTED / STORE IDENTITY BLOCKED**  
> Date: **2026-10-01**

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

This strict command must fail until the permanent platform application identities are explicitly approved and configured:

```text
expo.ios.bundleIdentifier
expo.android.package
```

## Why these values are not guessed

A bundle/package identifier becomes part of the durable Apple/Google application identity. The current repository contains no source-authorized exact values for either platform.

The implementation therefore must not derive them from:

- GitHub owner/repository names;
- `myeongha.vercel.app`;
- Expo slug `myeongha-mobile`;
- product display name `명하`;
- an arbitrary reverse-DNS namespace.

## CI behavior

```bash
npm run verify:mobile-release-readiness-contract
```

The CI contract mode permits only the two known missing identity blockers. Structural violations and non-canonical release API origin overrides still fail.

Once both platform ids are approved, CI can switch from contract mode to strict mode without changing the validator.

## Out of scope

M11-A does not authorize or configure:

- Apple Developer / Google Play account ownership;
- signing certificate / provisioning profile / keystore material;
- store listing identifiers or metadata;
- EAS project ownership;
- OTA update policy;
- push credentials;
- Apple IAP / Google Play Billing;
- production distribution.
