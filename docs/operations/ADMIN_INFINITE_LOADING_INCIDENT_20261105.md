# Admin Owner infinite loading incident — 2026-11-05

## Observed incident
Owner screen recording from approximately 16:50 KST shows overview and user list loading indicators remaining unresolved for more than 40 seconds, while the Admin sidebar still displays an active Owner session. This is a reproducible UI failure; previous successful listing on another tab does not prove this request succeeded. The exact upstream cause of the stalled reads is not yet proven.

## Confirmed implementation issue
The Admin browser sent GET requests and consumed response bodies without an application deadline. If the Worker/identity verifier/Hyperdrive connection or response stream failed to settle, the UI's finalizer would never run and the loading indicator would remain indefinitely.

## Corrective changes
- Browser requests have an AbortController-backed 12-second deadline (Owner session verification: 8 seconds per attempt). Separate bounded response-body consumption handles headers arriving without a complete JSON/CSV stream. The Owner gate is never bypassed, and a transient timeout does not silently revoke an authorized session.
- User, overview, finance, AI and command-read views share the bounded browser transport. The existing user-list Retry button becomes visible on timeout. Login shows the bounded failure reason.
- The private hosted API has a 15-second deadline for GET operations, with a safe 504 `ADMIN_READ_TIMEOUT` response and fixed-category diagnostic only. POST command operations are not automatically retried or interrupted by this new GET deadline.
- Admin Worker opens Hyperdrive read/audit pools only when a protected API read is actually admitted, not for static HTML/JS/CSS nor Member sign-in. Each pool has a bounded query timeout; separate Owner Access, Supabase Member authentication, exact Owner allowlist and audit write gates remain unchanged.
- Credit/refund/account command and analytics/retention mutation flags remain disabled. Only the independent Admin read-only Worker is eligible for rollout.

## Acceptance evidence required
- Required GitHub CI, Admin browser tests and hosted API regression tests must pass before merge.
- Dedicated read-only Admin release is successful and live Cloudflare security bindings match approved settings.
- Owner checks a fresh list/overview after deploy. A delayed query either completes or shows an actionable error in a bounded interval; **the actual data-read backend issue remains open until live success is observed**.
- Never ask the Owner to refresh repeatedly as a diagnostic substitute for server evidence.
