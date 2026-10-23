// Optional Cloudflare Hyperdrive transport for subject-scoped PostgreSQL.
// Stage 5 default remains the strict direct-TLS path until an independently
// approved Hyperdrive origin has been provisioned and bound via Wrangler.
// Watchtower-Track: ops
import { Pool } from 'pg';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  createNodePostgresSubjectPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import { MYEONGHA_API_EXECUTION_ROLE } from '../apps/api/src/production-user-data-runtime-config.ts';

export const CLOUDFLARE_HYPERDRIVE_MODE_V1 = 'approved-supabase-hyperdrive-v1';

// Runtime selection does NOT grant a DB role or verify a Hyperdrive origin.
// The surrounding Worker adapters separately require the approved source
// hostname, unprivileged login principal, pinned CA and TLS/RLS admission.
// The Wrangler hyperdrive id must be verified at provisioning time.
export function inspectCloudflareHyperdriveBindingV1(bindings) {
  const mode = bindings?.MYEONGHA_CLOUDFLARE_POSTGRES_TRANSPORT;
  if (mode === undefined || mode === 'direct-tls-v1') return { kind: 'direct' };
  if (mode !== CLOUDFLARE_HYPERDRIVE_MODE_V1) throw Error('Unapproved Cloudflare DB transport');
  if (bindings?.MYEONGHA_CLOUDFLARE_HYPERDRIVE_ORIGIN_POLICY !==
      'supabase-verify-full-rls-v1') throw Error('Hyperdrive origin verification missing');
  // A missing or malformed binding MUST NOT silently fall back to direct TCP.
  const value = bindings?.HYPERDRIVE?.connectionString;
  if (typeof value !== 'string' || value.length < 20 || value.length > 4096) {
    throw Error('Missing Hyperdrive runtime binding');
  }
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid Hyperdrive connection string'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname === '' || url.username === '' || url.password === '' ||
      url.hash !== '') throw Error('Unsafe Hyperdrive connection string');
  return { kind: 'hyperdrive', connectionString: value };
}

export function createCloudflareSubjectPoolV1(config, bindings, options) {
  // The route authority verifies strict CA pin, database origin, principal,
  // approved hostname and mode before this function is called.
  const target=inspectCloudflareHyperdriveBindingV1(bindings);
  if (target.kind === 'direct') return createNodePostgresSubjectPoolV1(config, options);
  if (config?.databaseExecutionRole !== MYEONGHA_API_EXECUTION_ROLE ||
      typeof config?.databasePrincipal !== 'string' ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(config.databasePrincipal)) {
    throw Error('Hyperdrive execution role is not authorized');
  }
  const pg=new Pool({
    connectionString:target.connectionString,
    max:1,
    connectionTimeoutMillis:options?.connectionTimeoutMs??5_000,
    idleTimeoutMillis:options?.idleTimeoutMs??1_000,
    statement_timeout:options?.statementTimeoutMs??5_000,
    allowExitOnIdle:true,
  });
  pg.on('error',error=>{
    // No SQL, connection URI, error message or credentials in Worker logs.
    console.error('Cloudflare Hyperdrive idle pool error',error?.name??'Unknown');
  });
  const driverPool={
    async connect() {
      const client=await pg.connect();
      return {
        async query(sql,values) {
          const result=values===undefined
            ?await client.query(sql)
            :await client.query(sql,[...values]);
          return { rows:result.rows };
        },
        release(error) { client.release(error); },
      };
    },
    async end() { await pg.end(); },
  };
  // Reuse the existing authoritative LOGIN principal + executable role
  // preflight and the same subject/RLS transaction executor as Vercel.
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool,
    expectedLoginPrincipal:config.databasePrincipal,
  });
}
