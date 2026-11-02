# Phase 9 — Dynamic API cache isolation (2026-10-30)

Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §27, §38 Phase 9.

## Applied endpoint classification

| Surface | Class | Cache policy |
| --- | --- | --- |
| `api/auth/*`, `api/session/bootstrap` | Auth/session/security | `no-store` |
| `api/me*`, current-subject birth profile and Saju calculation | User-private and current-subject computation | `no-store` |
| `api/birth-profiles`, dynamic chat, reads, and mutation responses behind `api/me` dispatcher | User-private and mutation | `no-store` |
| `api/readiness` | Dynamic operational state | `no-store` |
| `api/health` | Public dynamic liveness | `no-store` conservatively until an approved short-lived public freshness contract exists |
| Hashed/versioned immutable static assets | Static public asset | Not affected by this change; existing static asset CDN contracts remain separate |

The shared `executeSecurityObservedRequestV1` and `executeSecurityObservedNodeRequestV1` boundaries now override `Cache-Control`, `CDN-Cache-Control`, and `Vercel-CDN-Cache-Control` to `no-store` for every dynamic API response, including positive, denied, method-not-allowed, redirect, and unexpected-failure responses. Upstream cache settings cannot promote a private API response into CDN storage. The wrapper preserves the status, statusText, body stream, content headers and cookie headers; it does not rewrite the authentication or payload contract. Static files and hashed assets are outside this API boundary.

The test suite pins successful, redirected, denied, failed and bodyless responses, preexisting CDN cache settings, Node adapter behavior, and generic fallback; it uses synthetic-only payloads.

This phase addresses the **API cache isolation implementation** requirement and Phase 9's route classification. It does not claim external CDN production configuration, load-performance baselines or unrelated DR Hosted recovery. No production data, credentials, SQL, or infrastructure resources are changed.

Watchtower-Track: ops
