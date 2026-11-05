# Admin persistent Owner session — 2026-11-05

## Approved scope
- Dedicated `myeongha-admin` Worker and Admin SPA only. The customer `myeongha` Worker, database roles and mutation operations are unchanged.
- Owner Access gate remains mandatory before any request reaches the Worker. A Supabase Member JWT from the existing, scoped Member auth service is reverified against the server-only exact Owner allowlist on each Admin read.
- On successful Member sign-in, the Admin Worker returns a host-only `__Host-MyeongHaAdminSession` cookie with `Secure; HttpOnly; SameSite=Strict; Path=/`, **never** a JWT in the JSON body.
- Cookie validity is capped at the shorter of the JWT expiry or 60 minutes. No refresh token is stored. Browser restart or reload during that window can restore the Owner session by a fresh server verification.
- GET reads only can obtain a bearer credential from the cookie inside the private Worker. This path is deliberately **not** used for POST command mutations; read-only deployment flags and the absence of command bindings remain unchanged.
- Explicit `POST /api/admin/logout` requires matching `Origin` and expires the cookie. This clears the browser-held Admin credential; it does not revoke a separately stolen JWT upstream. Cloudflare Access session lifetime is independent.
- No localStorage, sessionStorage or JS-readable Member JWT.

## Verification required before declaring complete
- CI test and Admin typecheck/build pass, including cookie boundaries, no JWT response, read-only GET, mutating POST denial, logout, expired cookies.
- Dedicated readonly release workflow deploys to `myeongha-admin`, with live bindings and flags read back. Customer Worker not redeployed.
- Human Owner check: sign in once, Ctrl+F5, navigate and open same hostname in another tab; Owner session should be restored while the JWT-backed cookie is valid. After logout, refresh must require sign in. An expired session must fail closed.
- Following this, resume existing user/commerce/Reading read verification. Do not infer that live read errors are fixed merely by session persistence.
