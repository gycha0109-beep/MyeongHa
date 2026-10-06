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

## Naver OAuth transport compatibility

Naver's profile endpoint returns an envelope containing `response.id`, rather than
the top-level `sub` consumed by Supabase custom OAuth. Its token exchange also
requires the authorization `state`; Supabase's generic exchange supplies the code
and PKCE verifier but not that state. The Naver transport bridge addresses both
without creating users, issuing Member sessions, or owning any persistent session.

```text
Mobile -> Supabase custom:naver -> MyeongHa bridge authorize -> Naver
Naver -> MyeongHa bridge callback -> Supabase callback
Supabase -> MyeongHa bridge token -> Naver token endpoint
Supabase -> MyeongHa bridge userinfo -> Naver profile endpoint
Supabase -> existing mobile callback -> existing MemberSessionV1 flow
```

The four bridge URLs reuse the existing Vercel sign-in function:

| Supabase provider field | Production value |
| --- | --- |
| Identifier | `custom:naver` |
| Authorization URL | `https://myeongha.vercel.app/api/auth/social/naver/authorize` |
| Token URL | `https://myeongha.vercel.app/api/auth/social/naver/token` |
| UserInfo URL | `https://myeongha.vercel.app/api/auth/social/naver/userinfo` |
| Client ID | Naver app Client ID |
| Client Secret | User enters directly into Supabase; never recorded in source/evidence |
| PKCE | Enabled, S256 required |
| Allow users without an email | Enabled (`email_optional: true`) |

Naver Developers must register the **bridge callback**
`https://myeongha.vercel.app/api/auth/social/naver/callback`.
The Supabase callback remains
`https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/callback`; it is the bridge's fixed
downstream destination. No mobile custom scheme is registered with Naver.

Production-only server configuration:

- `MYEONGHA_NAVER_CLIENT_ID`: same public app ID configured in Supabase.
- `MYEONGHA_NAVER_OAUTH_BRIDGE_KEY`: independent random 32-byte AES key, encoded as
  unpadded base64url (43 characters). Store only in Vercel's server environment;
  never use a public/mobile variable or record the value in evidence.
- `MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED=true`: transport gate, enabled only after
  source deployment and provider setup are ready for the registered tester.
- `MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED`: keep false/absent until real provider
  roundtrip and Member-session verification succeed.

The bridge encrypts and authenticates the Supabase state/PKCE binding, preserves
Naver's state through token exchange, and accepts only fixed provider endpoints,
app ID, and redirect destinations. State expires after ten minutes; the sealed code
after at most one minute. Naver owns one-time authorization-code consumption.
Supabase gets a sealed access-token handle lasting at most five minutes, used only
to fetch the profile. Provider refresh tokens are discarded. The bridge has no
database or session persistence. Key rotation invalidates outstanding handles;
disabling the transport gate is its rollback switch.

Only Naver's app-scoped ID, optional nickname and HTTPS profile picture are mapped.
Contact email is deliberately omitted from Supabase's identity claims so matching
email cannot trigger Supabase automatic identity linking. MemberSessionV1 email
may remain null. The bridge never promotes Guest data or merges accounts.

Upstream request/response sizes and network duration are bounded. Redirects from
upstream are rejected. Failures use fixed errors without upstream bodies, codes,
credentials or profile data. Do not enable request-body/header logging on these
routes; use the existing security observer's bounded status events.

Activation remains **IMPLEMENTED_UNVERIFIED** until this exact source is deployed,
Naver callback and Supabase custom provider are saved, and a registered developer
account completes the real flow. Naver's development app permits registered
members only; review approval is separately required for general-user availability.
No APK build is part of this change.

Compatibility references (checked 2026-10-06):
[Naver token API](https://developers.naver.com/docs/login/api/api.md),
[Naver profile API](https://developers.naver.com/docs/login/profile/profile.md),
[Supabase custom OAuth](https://supabase.com/docs/guides/auth/custom-oauth-providers),
[Supabase generic provider source](https://github.com/supabase/auth/blob/master/internal/api/provider/custom_oauth.go).
