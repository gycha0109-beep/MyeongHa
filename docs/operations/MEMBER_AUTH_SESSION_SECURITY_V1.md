# MEMBER AUTH SESSION SECURITY V1

Status: governed Web auth transport authority  
OWASP mapping: A07:2025 Authentication Failures  
Issue: #1525

## Objective

The Web product must not persist long-lived Member refresh authority in JavaScript-readable browser storage.

The Member access token remains browser-readable because current product APIs use Bearer authorization. The refresh credential is moved behind the server-controlled Web auth transport boundary.

## Transport split

### Web

Web `apps/web/product-auth.js` declares:

```text
X-MyeongHa-Auth-Transport: web-cookie-v1
```

This header selects response/request transport semantics only. It is **not** an authentication credential and must never be treated as identity proof.

For this transport:

- sign-in/sign-up authenticated responses omit `refreshToken` from JSON;
- refresh reads the refresh credential from the governed HttpOnly cookie;
- successful refresh rotates the cookie and returns only the browser-visible access session;
- sign-out clears the refresh cookie;
- `localStorage["myeongha.memberSession.v1"]` contains no refresh credential.

### Native / shared API client

Requests without the Web transport marker preserve the existing JSON Member session contract.

This is required because the native mobile client stores the Member session in Expo SecureStore rather than Web `localStorage`.

The A07 remediation must not weaken or silently break the existing native secure-store session contract.

## Refresh cookie authority

Cookie name:

```text
myeongha_member_refresh_v1
```

Attributes:

```text
Path=/api/auth
HttpOnly
Secure
SameSite=Strict
Domain omitted
```

Properties:

- **HttpOnly**: browser JavaScript cannot read the refresh credential;
- **Secure**: the credential is sent only over HTTPS;
- **SameSite=Strict**: cross-site requests do not carry the refresh credential;
- **Path=/api/auth**: the cookie is not sent to unrelated application routes;
- **Domain omitted**: the cookie remains host-only;
- no normal `Max-Age` or `Expires` is set, so the governed Web refresh credential is a browser-session cookie;
- deletion uses the same attributes plus `Max-Age=0`.

No token value may appear in a URL, query parameter, log, browser diagnostic payload, or public error.

## CSRF boundary

The Web refresh credential is protected by the combined boundary below:

1. `SameSite=Strict` cookie delivery;
2. host-only cookie scope;
3. `Path=/api/auth`;
4. Web auth calls are same-origin JSON fetches with `credentials: "same-origin"`;
5. the application exposes no CORS authority that permits another origin to read authenticated auth responses.

The `X-MyeongHa-Auth-Transport` header is not a CSRF secret and must not be used as one.

If future deployment topology introduces cross-origin Web auth, sibling-domain trust, or permissive CORS, this CSRF decision must be reopened before rollout.

## Legacy Web migration

Older Web builds stored:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": "..."
}
```

The current Web reader accepts that shape only to recover the short-lived access session, then immediately rewrites the same localStorage key without `refreshToken`.

No new Web code writes a refresh credential to localStorage.

If the legacy refresh credential cannot be removed safely, the Web auth boundary fails rather than intentionally persisting the long-lived credential.

## Race guarantees

Existing Member mutation locking remains authoritative:

```text
myeongha.memberSession.v1.refresh.lock
```

Sign-in, authenticated sign-up, refresh commit, and sign-out continue to use the existing lock/generation checks. Session generation comparison is based on browser-visible access-session generation rather than the hidden refresh credential.

## Verification

Required evidence:

- cookie attribute unit tests;
- Web legacy-storage sanitization regression;
- Web refresh request regression proving no JavaScript refresh credential is sent;
- native JSON transport regression;
- sign-in/sign-up/refresh/sign-out browser regression;
- exact-head CI and Integration PASS;
- Production verification of sign-in continuity, refresh rotation, expiry, and sign-out cleanup.

Watchtower-Track: security
