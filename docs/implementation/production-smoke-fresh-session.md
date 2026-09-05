# Production smoke fresh-session credential lifecycle

## Decision

Production Member and current-subject Saju smokes must not depend on a copied short-lived access token.

The governed `production` GitHub Environment provides:

- `MYEONGHA_PRODUCTION_MEMBER_EMAIL`
- `MYEONGHA_PRODUCTION_MEMBER_PASSWORD`
- `MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID`

Each smoke signs in through the canonical production `/api/auth/sign-in` route, keeps the returned access token only in process memory, uses it for the bounded smoke requests, and discards it when the process exits.

The smoke helper does not persist or log the email, password, access token, or refresh token. Refresh-token rotation is intentionally outside this workflow because every run acquires a fresh session.

## Scope

This authority applies only to the read-only Production Member `/api/me` smoke and the non-persistent current-subject Saju calculation smoke. It does not alter browser session behavior, Supabase Auth configuration, production user-data authority, the persistent Birth write-smoke account, or Saju service credentials.
