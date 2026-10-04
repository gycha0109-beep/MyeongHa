# Mobile Social Auth v1

> Track: `applizing`  
> Status: **SOURCE IMPLEMENTED / EXTERNAL PROVIDER ACTIVATION PENDING**

## Scope

Mobile social login is implemented as an additional entry point into the existing
Supabase-backed Member session authority. It does not create a second session model.

Supported provider identifiers:

```text
google -> Supabase built-in google
kakao  -> Supabase built-in kakao
naver  -> Supabase custom:naver
```

The mobile callback is:

```text
myeongha://auth/callback?state=<server-generated-state>
```

The server only accepts the exact `myeongha://auth/callback` redirect base and adds
a cryptographically random state. The pending state and the starting Guest identity
are stored in SecureStore. A callback is accepted only when the state and Guest
ownership still match and the request has not expired.

## Existing-member and new-member behavior

```text
new social identity -> promote the current Guest subject -> Member
existing Member     -> GUEST_MERGE_REQUIRED -> sign in to existing Member
```

Existing-member login never reparents or auto-merges the current Guest records.

Push subject switching remains governed by the existing mobile Push lifecycle:
prepare before the Member commit, then no-prompt sync after success or rollback.

## External activation

Source is fail-closed until each provider is configured externally and its matching
Production flag is set:

```text
MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED=true
MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED=true
MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED=true
```

Only enable a flag after the matching provider has been enabled in the governed
Supabase Production project and its provider callback/redirect configuration has
been verified.

Supabase mobile redirect allow-list must admit the state-bearing callback pattern
under `myeongha://auth/callback`.

No Google/Kakao/Naver client secret is stored in the repository or mobile bundle.
