# Supabase support request draft — not sent

Subject: Supported remediation for supabase_admin public default grants (project cnsfpcdiyofqvhpcegfc)

Project: MyengHa / cnsfpcdiyofqvhpcegfc, PostgreSQL 17.6, ap-southeast-1.

We need a supported platform procedure for the residual public default-ACL recurrence path. Fresh read-only production catalog checks on 2026-10-24 show:

- public relation privilege objects for anon: 0; authenticated: 0;
- public routine EXECUTE objects for anon: 0; authenticated: 0;
- public relations owned by supabase_admin: 0;
- managed postgres is not SUPERUSER and is not a member of supabase_admin;
- pg_default_acl still contains supabase_admin-owned public sequence/table/function defaults granting anon, authenticated and service_role automatic privileges on future objects.

Our application uses restricted direct PostgreSQL connections. Application-owned API exposure is contained; we have not changed the internal platform role or its defaults. Our schema migration defaults and explicit per-object revokes do not remove the supabase_admin-owned rows.

The official announcement says the explicit-grant default reaches existing projects on October 30, 2026:
https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

The current Securing your API guide documents changing defaults for postgres, but we found no supported customer procedure for supabase_admin defaults:
https://supabase.com/docs/guides/api/securing-your-api

Please confirm:

1. Will the October 30 rollout remove or neutralize the existing supabase_admin pg_default_acl rows on this hosted project, including functions and sequences?
2. If not, can Supabase apply a supported platform-side change? Alternatively, please provide the supported customer procedure, required principal/permissions, preconditions, effects on managed upgrades/automations, and rollback semantics.
3. Which fresh catalog/platform evidence should we collect to confirm that future platform-created public objects cannot become customer-visible through these defaults?

We will validate a documented procedure outside Production before applying it. We are not asking for escalation to supabase_admin or a blanket public-schema ACL rewrite.

This draft contains project/catalog metadata only. No credentials, network identifiers, user data, Birth data, or application payloads are attached.
