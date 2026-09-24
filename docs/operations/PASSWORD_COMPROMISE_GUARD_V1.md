# MyeongHa Password Compromise Guard V1

Status: **APPROVED IMPLEMENTATION AUTHORITY**

Issue: `#642`

## 1. Objective

Prevent known-compromised passwords from becoming an accepted MyeongHa credential without depending on a provider-plan-specific leaked-password feature.

The active password-entry routes are:

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`

Both terminate at the MyeongHa server Auth boundary before the browser can receive a member session.

## 2. Provider and disclosure boundary

Compromise intelligence source:

```text
provider = HIBP Pwned Passwords Range API
origin   = https://api.pwnedpasswords.com
path     = /range/{SHA1_PREFIX_5}
```

The server computes SHA-1 only for compatibility with the HIBP range protocol.

External disclosure is strictly:

```text
first 5 hexadecimal characters of SHA-1(password)
```

MyeongHa must never send to HIBP:

- the plaintext password;
- the complete SHA-1 digest;
- the remaining 35-character SHA-1 suffix;
- the member email;
- the member subject id;
- Supabase bearer/session material.

The 35-character suffix comparison occurs only inside the MyeongHa server process.

## 3. Password material handling

Password material is request-scoped only.

The implementation must not:

- log plaintext passwords;
- log the complete SHA-1 digest;
- persist plaintext passwords or complete password hashes;
- place password material in GitHub Actions artifacts;
- place password material in analytics or operational evidence;
- cache password-specific full digests durably.

The HIBP response is public range data, but the runtime still bounds it to a finite response size and deadline.

## 4. Request contract

HIBP calls are fixed to:

```text
method        = GET
origin        = https://api.pwnedpasswords.com
path          = /range/{5-char uppercase SHA-1 prefix}
Add-Padding   = true
cache         = no-store
redirect      = error
timeout       = 3000 ms
max body      = 524288 bytes
```

A malformed, oversized, timed-out, non-2xx, or empty provider response is `unavailable`. It is never interpreted as `clear`.

## 5. Sign-up authority

For `POST /api/auth/sign-up`:

1. parse and bound the MyeongHa request body;
2. validate email/password shape;
3. execute Password Compromise Guard;
4. if compromised, return `COMPROMISED_PASSWORD` without calling Supabase Auth;
5. if the compromise provider is unavailable, return `PASSWORD_SECURITY_UNAVAILABLE` and fail closed;
6. only a clear result may proceed to the governed Supabase Auth sign-up call.

Therefore a known-compromised password cannot create an account through the active MyeongHa sign-up surface.

## 6. Sign-in authority

For `POST /api/auth/sign-in`:

1. Supabase Auth first validates the submitted credential;
2. invalid credentials preserve the existing source-safe `INVALID_CREDENTIALS` response;
3. after successful credential validation, Password Compromise Guard evaluates the submitted password;
4. if compromised:
   - MyeongHa does not return access or refresh tokens;
   - MyeongHa makes a best-effort logout call for the newly-created upstream session;
   - the public response is `COMPROMISED_PASSWORD`;
5. if the compromise provider is unavailable:
   - established sign-in remains available;
   - the response marks `passwordCompromiseCheck = unavailable`;
   - unavailable is not represented as known-clear;
6. a clear result returns the ordinary member session with `passwordCompromiseCheck = clear`.

This availability distinction is intentional: new credential creation fails closed, while failure of the external compromise-intelligence provider alone does not create a total login outage for existing members.

## 7. Browser and direct-provider boundary

The Production browser Auth implementation calls same-origin MyeongHa routes. It does not directly call Supabase Auth or HIBP.

Current browser authority:

```text
sign-up  -> /api/auth/sign-up
sign-in  -> /api/auth/sign-in
CSP      -> connect-src 'self'
```

The Supabase API key remains server runtime configuration. It is not a browser contract.

If a future Production client exposes a direct Supabase Auth credential path, that path becomes an explicit bypass and this authority is no longer complete until that path is removed or independently guarded.

## 8. Password-change boundary

There is no active MyeongHa password-change endpoint in this authority version.

Any future endpoint that creates or replaces a password must:

- use the same Password Compromise Guard before accepting the new password;
- fail closed on unavailable compromise intelligence;
- preserve the same no-log/no-persist boundary;
- add positive and bypass-regression tests before Production activation.

## 9. Verification

Repository verification must prove:

- only SHA-1 prefix 5 is sent to HIBP;
- plaintext and full SHA-1 never appear in the HIBP request;
- compromised sign-up never reaches Supabase;
- malformed/provider-failed sign-up fails closed;
- compromised successful sign-in withholds the session and invokes logout;
- HIBP sign-in outage preserves existing login availability while explicitly reporting unavailable;
- the HIBP response is deadline- and byte-bounded;
- browser auth remains same-origin;
- future direct browser Supabase Auth wiring is rejected by governance checks.

Production verification must use a known-compromised test password only as ephemeral request input. The password itself must not be logged or persisted in evidence. Closure evidence records only the public rejection code/status and exact deployed revision.

Watchtower-Track: ops
