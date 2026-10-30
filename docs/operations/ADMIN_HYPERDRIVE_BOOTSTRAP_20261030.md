# Admin Hyperdrive private credential bootstrap (2026-10-30)

This implements the existing credential -> TLS verify-full -> two dedicated Hyperdrives roadmap gate. It does not deploy the Admin Worker or activate any commands.

Requirements: Node.js 24, PostgreSQL 17 psql, the Supabase CA certificate on the local machine, and the two distinct Admin role passwords. Never paste passwords/API tokens in ChatGPT, source files or terminal command arguments.

PowerShell, in the repository root:

    $env:MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_FILE = 'C:\secure\supabase-root-ca.crt'
    $env:PSQL_BIN = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
    node apps/admin/create-dedicated-hyperdrives.mjs --preflight-only

The terminal hides each password entry. Both roles must pass a real PostgreSQL TLS verify-full connection as themselves. The psql child receives each password via an ephemeral process environment, never a command argument or file; use a trusted local PC. The cert file must be the correct Supabase CA and must not be committed.

After TLS success, create a restricted Cloudflare API token with Hyperdrive Write for account 410d3f82ed3ccc66609a2b698803859b. Then run:

    node apps/admin/create-dedicated-hyperdrives.mjs

Enter the two role passwords and token when prompted (the token can alternatively be supplied in CLOUDFLARE_API_TOKEN). The script creates two cache-disabled, verify-full Hyperdrives with the existing trusted CA ID, or validates exact named configurations without modifying them. A partial creation on failure must be inspected before retrying. Only role names and Hyperdrive IDs are printed.

Record the IDs in MYEONGHA_ADMIN_READ_HYPERDRIVE_ID and MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID through the authorized private deployment Secret channel. The existing stage-inactive workflow still requires the other dedicated URL/CA/Access/Owner Secrets and performs its own live gate checks.

This is not evidence that the Owner authenticated, the Worker was deployed, or production read access was enabled. Public myeongha Worker, previous Hyperdrives and customer data remain unchanged.
