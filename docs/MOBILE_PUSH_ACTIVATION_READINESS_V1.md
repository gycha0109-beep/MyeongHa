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

## Production activation workflow

Repository automation is defined in:

`.github/workflows/mobile-push-production-activate.yml`

It requires two external automation credentials in the GitHub `production` Environment:

```text
VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN
EXPO_TOKEN
```

The Vercel credential is deliberately separate from `VERCEL_SECURITY_ALERTS_TOKEN`; the
security-alert credential is not reused outside its governed purpose.

When both credentials exist, the activation workflow:

1. creates the two server token-protection values only when absent;
2. stores them as Vercel **sensitive** Production variables without emitting their values;
3. creates or links the EAS project non-interactively;
4. stores the resolved project UUID as `EXPO_PUBLIC_EAS_PROJECT_ID` in the EAS Production environment;
5. verifies the source activation contract;
6. redeploys current Vercel Production so the new server secrets are active;
7. smoke-checks both canonical Device Installation routes.

If either automation credential is absent, preflight records only the missing credential
name and skips all external mutation.

## Current boundary

As of 2026-10-02, source/runtime implementation and the guarded activation path are
implemented. External activation remains blocked whenever either dedicated automation
credential is absent.

A successful activation means registration plumbing is live. It does **not** authorize
notification creation, sending, retry/failover, or scheduler cadence; those remain under
`SRC-31` and `SRC-32`.
