# Admin console navigation rate-limit incident — 2026-11-05

## Evidence
Owner reported an intermittent white page and raw `ADMIN_RATE_LIMITED` JSON during normal admin navigation and refresh, with a 54-second screen recording. The screen recording shows transient blank navigation states and subsequent successful data loads. The original hosted handler consumed the same Owner quota on every request, including HTML and JS/CSS assets. The configured budget is 60 requests per 60 seconds.

## Correction
- Cloudflare Access still authenticates the Owner on **all** requests, including assets.
- Only `/api/` requests consume the per-Owner Worker API rate limiter; HTML and static assets remain private but are no longer rate limited by the application-level quota.
- Existing API budget remains 60 requests/60 seconds. Separate deterministic keys for sign-in, read and other requests prevent unrelated API classes from exhausting one another. This is not a change to the Cloudflare Access policy.
- The 429 response and `Retry-After` remain on API requests. No credit, refund, account or retention commands are enabled.
- Regression tests cover exhausted quota with HTML/assets still served, 429 for APIs, Access denial, and distinct API keys.

## Acceptance
After CI and the dedicated `readonly` deployment, verify that authenticated Owner navigation / refresh never displays a raw `ADMIN_RATE_LIMITED` JSON document; API bursts may still return an in-app 429 message. Confirm that logout and unauthorized access remain blocked. Separately investigate persistent list loading failures; this incident does not establish their root cause.
