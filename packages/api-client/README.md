# @myeongha/api-client

Shared Web/Mobile API client foundation.

## M2 boundary

The package owns only portable HTTP transport and source-backed response parsing. It does **not** own product authority.

Current bindings:

- `POST /api/session/bootstrap`
- `GET /api/me`
- Guest bearer normalization and bootstrap reuse continuity

Rules:

- caller identity is supplied only as `Authorization: Bearer ...`;
- bootstrap body is always an empty object and never contains subject/token/expiry authority;
- bearer credentials are never written to logs or error messages;
- HTTP success without a valid MyeongHa success envelope fails closed;
- a reusable Guest bootstrap response with `bearerToken: null` is accepted only when the caller still holds the exact matching Guest credential.

Mobile persistence is implemented by the Mobile SecureStore adapter, not by this package.
