# Admin Hyperdrive private credential bootstrap (2026-10-30)

This implements the existing credential -> TLS verify-full -> two dedicated Hyperdrives roadmap gate. It does not deploy the Admin Worker or activate any commands.

## Verified Supabase IPv4 pooler port (2026-10-30)

The dedicated Admin Reader role successfully authenticated with PostgreSQL TLS `verify-full` through the Supabase IPv4 transaction pooler on port **6543**. Authentication through the session pooler on port 5432 failed. The database direct hostname has only an IPv6 address and the operator PC lacks an IPv6 default route. Do not interpret the direct DNS failure as bad credentials.

The bootstrap now selects port 6543 by default for its local `psql` preflight and any newly created Admin Hyperdrives. `MYEONGHA_ADMIN_POOLER_PORT=5432` may be used for isolated diagnosis, but must not be used to bypass the live TLS gate. The verifier checks that the configuration uses exactly the selected port. **Port 6543 is a provisional connectivity choice, not proof of production compatibility**: Hyperdrive already pools in transaction mode, and Supabase transaction pooling adds another layer. Verify real Admin reads and audit writes before activation.

On a trusted Windows CMD console, where the CA certificate is at the project root, use:

```cmd
cd /d D:\\cha\\MyeongHa-admin-console-20261029
set MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_FILE=D:\\cha\\MyeongHa-admin-console-20261029\\prod-ca-2021.crt
set PSQL_BIN=C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe
node apps/admin/create-dedicated-hyperdrives.mjs --preflight-only --clipboard
```

With `--clipboard`, **copy each distinct role password locally, then press Enter when prompted**; do not paste it into CMD, ChatGPT, or Git. The script reads the current Windows clipboard, clears its text immediately, strips terminal trailing newlines, and passes the secret to `psql` only through the child process environment. Both role logins must pass before the preflight reports success. The clipboard feature is opt-in; the original hidden typing mode remains available.

After both roles pass and a dedicated Hyperdrive Write token is available locally, run:

```cmd
node apps/admin/create-dedicated-hyperdrives.mjs --clipboard
```

The script requests the role passwords again and then the Cloudflare token through local clipboard input (unless the token is already in `CLOUDFLARE_API_TOKEN`). It creates or verifies only the two named Admin configurations with cache disabled and `verify-full`. Verify the resulting IDs and Worker inactivity before any Owner-gated activation. Never store the passwords in scripts or shell command lines.

## Audit Writer password recovery without two independent copies

If the Admin Reader passes verify-full on port 6543 but Admin Audit Writer remains rejected after a successful SQL Editor `ALTER ROLE`, do not retry the same password-entry sequence. Supavisor may log `Validation secrets changed, cache updated` while the supplied candidate password still fails SCRAM verification. That event proves the role secret changed, not that the candidate matches it.

Use a **single-source password synchronization** flow on the trusted Windows machine. Start from CMD after setting the CA and `PSQL_BIN` variables shown above:

```cmd
node apps/admin/create-dedicated-hyperdrives.mjs --sync-audit-password
```

1. Copy the chosen **Audit Writer** password from your password manager. At the prompt press **Enter only**. Never type or paste the password into the terminal. The script captures this secret exactly once and replaces the clipboard with a properly quoted `ALTER ROLE myeongha_admin_audit_writer ...` statement derived from that same value.
2. Paste the SQL into the Supabase project's SQL Editor and execute it. Return to CMD and press Enter after the SQL Editor says Success.
3. The same Node process clears the SQL clipboard and verifies the **same in-memory password** through the selected Supabase pooler port with `verify-full`. It prints only `Audit Writer TLS verify-full OK` on success or a safe failure code. No extra password copy or reset is necessary.

Do not save SQL Editor queries containing passwords in source files, and manage the SQL Editor history appropriately. The selected password must be retained in a secure password manager for future Hyperdrive bootstrap; the synchronization command neither stores a local password file nor creates Hyperdrives. If the same-source verification still fails, stop and investigate Supavisor authentication independently rather than changing the password again.

The clipboard mode now rejects any characters typed or pasted at the terminal's Enter-only prompts; this prevents accidental clear-text echo.

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
