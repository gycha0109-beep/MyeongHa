# Mobile Push Activation Readiness v1

> Track: `applizing`  
> Status: **IMPLEMENTED / PRODUCTION ACTIVATED / PHYSICAL DEVICE SMOKE PENDING**  
> Product-owner decision: **2026-10-02**  
> Activation evidence: **2026-10-03**

## Scope

The Mobile Push foundation is implemented and Production-routed for:

```text
device register
same-install refresh
Expo Push token rotation
same-subject rebind
owner-scoped revoke
logout/account-switch cleanup
```

The Mobile iOS/Android MVP transport service is **Expo Push Notifications**.

This document does not authorize notification creation, sending, retry/failover, or
scheduler cadence. Those remain governed by `SRC-31` and `SRC-32`.

## Executable preflight

Strict operator check:

```bash
npm run verify:mobile-push-activation-readiness
```

Repository/CI contract check:

```bash
npm run verify:mobile-push-activation-readiness-contract
```

The contract still fails on structural drift or malformed configured values.

## Activated external values

### Mobile build identity

The real EAS project identity is activated and source-pinned:

```text
Expo account/project @johnny0109/myeongha-mobile
EXPO_PUBLIC_EAS_PROJECT_ID=5c20243c-60a8-44f3-9d8c-ca06ccc8bebe
```

The value came from the EAS project created/linked through the guarded Production
activation workflow. It is not derived from the GitHub repository, Vercel project,
app slug, or package id.

### Production API token protection

The guarded Production activation workflow provisioned and bound:

```text
MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET
MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET
```

Their values remain secret and are not stored in repository evidence.

## Source-owned structural invariants

The preflight verifies:

```text
expo-notifications plugin present
expo-notifications dependency present
expo-application dependency present
iOS bundleIdentifier = com.myeongha.app
Android package       = com.myeongha.app
real EAS project UUID pinned
```

## Production activation evidence

Repository automation is defined in:

`.github/workflows/mobile-push-production-activate.yml`

It uses dedicated credentials from the GitHub `production` Environment:

```text
VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN
EXPO_TOKEN
```

The activation completed successfully on 2026-10-03.

```text
Activation GitHub run 37091273714
Vercel redeploy        READY
Production route smoke PASS
Runtime errors         0 in immediate post-activation check
```

The activation path:

1. confirmed dedicated external automation credentials;
2. provisioned the two server token-protection values only when absent;
3. stored them as Vercel sensitive Production variables without emitting values;
4. created/linked the EAS project;
5. bound `EXPO_PUBLIC_EAS_PROJECT_ID` in the EAS Production environment;
6. verified the source activation contract;
7. redeployed current Vercel Production through the Vercel REST API;
8. smoke-checked both canonical Device Installation routes.

## Android physical-smoke build evidence

A no-production-signing Android build also completed successfully:

```text
EAS build ID   2e5b3093-5f09-469a-a99d-38cc53e5f117
GitHub run     37098850829
Profile        physical-smoke
Node           24.14.0
Gradle command :app:assembleDebug
Credentials    withoutCredentials=true
```

The build exists only to support physical-device registration lifecycle smoke.
It does not establish store-signing readiness.

## Current boundary

Production registration plumbing is live. The remaining Push activation evidence is
physical-device lifecycle smoke:

- explicit permission request from My;
- Expo Push token acquisition;
- register API success;
- same-install refresh after relaunch;
- token rotation if naturally observable;
- logout revoke;
- re-login/rebind;
- no plaintext Push token in application/server logs.

A successful physical-device smoke still does **not** authorize notification creation,
sending, retry/failover, or scheduler cadence; those remain under `SRC-31` and
`SRC-32`.
