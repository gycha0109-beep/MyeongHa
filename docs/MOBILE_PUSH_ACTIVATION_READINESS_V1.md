# Mobile Push Activation Readiness v1

> Track: `applizing`  
> Status: **IMPLEMENTED / EXTERNAL ACTIVATION BLOCKED**  
> Product-owner decision: **2026-10-02**

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

Contract mode allows known external blockers to remain absent, but it still fails on
structural drift or malformed configured values.

## Required external activation values

### Mobile build identity

```text
EXPO_PUBLIC_EAS_PROJECT_ID
```

Must be the real EAS project UUID for the Mobile project. The repository must not invent
or derive this value from the GitHub repository, Vercel project, app slug, or package id.

### Production API token protection

```text
MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET
MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET
```

Each value must be at least 32 bytes. These are server-side values and must not use the
`EXPO_PUBLIC_` namespace or be embedded into the Mobile bundle.

## Source-owned structural invariants

The preflight also verifies:

```text
expo-notifications plugin present
expo-notifications dependency present
expo-application dependency present
iOS bundleIdentifier = com.myeongha.app
Android package       = com.myeongha.app
```

## Current boundary

As of 2026-10-02, source and runtime implementation are complete, but activation remains
externally blocked until the real EAS project UUID and both Production server secrets are
provisioned.

A successful preflight means the registration plumbing can be activated. It does **not**
mean notification sending or scheduler authority is complete.
