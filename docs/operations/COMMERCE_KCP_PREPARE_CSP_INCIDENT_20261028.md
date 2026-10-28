# Owner KCP prepare CSP failure — 2026-10-28

Track: `commerce-payment`. Baseline main `1ec28b4501b3f1d94734189de70dadedfd2ac370`.

## Observed failure

Actual Chrome, canonical Owner sandbox page, active Worker
`eafcc22a-87e8-442d-898f-d6f55fdde2a7`:

- Same-origin SDK loaded; server preparation and checkout handoff succeeded.
- SDK tried `POST https://checkout-service.prod.iamport.co/api/prepare/v2`.
- The fetch rejected with `TypeError`; the UI reported `UnknownError / Failed to fetch`.
- A `securitypolicyviolation` event reported `connect-src` for that URL.
- Chrome's security log explicitly identified the document's policy:
  `connect-src 'self' https://*.portone.io https://*.kcp.co.kr`.

The request was blocked before provider network I/O. This is evidence of CSP
rejection, not a CORS response, merchant configuration error or KCP response.
The earlier computer-control URL-safety interruption is a separate tooling event.

## Fix and verification boundary

Add only `https://checkout-service.prod.iamport.co` to `connect-src` on the exact
Owner sandbox HTML route. Preserve the general SPA policy, authentication,
sandbox checks, fixed price/product, server PAID authority and no sandbox credit mint.
No wildcard iamport domain, generic HTTPS permission, proxy fallback or credential
forwarding is introduced.

Direct regression verifies the required SDK service origin is confined to this
page policy. Hosted acceptance must verify the new policy and repeat the actual
SDK prepare request. SDK availability or a CSP fix alone does not prove KCP
window success, server PAID, Receipt persistence or credit fulfillment.

Diagnostics collected only host/path, HTTP method, error class and CSP directive.
No request headers, tokens, card/customer data or payment bodies were recorded.
The temporary in-page fetch tracer is removed by a normal reload/closing its tab.
