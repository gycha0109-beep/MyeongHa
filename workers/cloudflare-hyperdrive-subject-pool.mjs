// Optional Cloudflare Hyperdrive transport for subject-scoped PostgreSQL.
// Stage 5 default remains the strict direct-TLS path until an independently
// approved Hyperdrive origin has been provisioned and bound via Wrangler.
// Watchtower-Track: ops
import { Client, Pool } from 'pg';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  createNodePostgresSubjectPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import {createSeyeonGovernedPostgresPoolFromDriverV1,SEYEON_GOVERNED_DB_LOGIN_V1} from '../apps/api/src/seyeon-governed-postgres-pool-v1.ts';
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
  // Hyperdrive has a separately provisioned, unprivileged login; it is NOT
  // the source Direct-TLS credential. Pin that role before any connection.
  if (bindings?.MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL !==
      'myeongha_cf_hyperdrive_login') throw Error('Unexpected Hyperdrive login role');
  // A missing or malformed binding MUST NOT silently fall back to direct TCP.
  const value = bindings?.HYPERDRIVE?.connectionString;
  if (typeof value !== 'string' || value.length < 20 || value.length > 4096) {
    throw Error('Missing Hyperdrive runtime binding');
  }
  requireHyperdriveConnectionStringV1(value);
  return { kind: 'hyperdrive', connectionString: value };
}

function requireHyperdriveConnectionStringV1(value){
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid Hyperdrive connection string'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname === '' || url.username === '' || url.password === '' ||
      url.hash !== '') throw Error('Unsafe Hyperdrive connection string');
  return value;
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
  const driverPool=createRequestOwnedHyperdriveClientDriverV1(target.connectionString,options);
  // Reuse the existing authoritative LOGIN principal + executable role
  // preflight and the same subject/RLS transaction executor as Vercel.
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool,
    expectedLoginPrincipal:bindings.MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL,
  });
}

// Ordinary Auth/Guest requests must not keep a pg Pool across Hyperdrive
// leases. Hyperdrive already owns the remote connection pool: acquire one
// fresh node-postgres Client for each subject-scoped connection, and close it
// before the next lease. This prevents a Worker request from reusing a socket
// after a request-context GC/connection termination.
export function createRequestOwnedHyperdriveClientDriverV1(connectionString,options,{createClient=(settings)=>new Client(settings)}={}){
  let nextLease=Promise.resolve();
  let closed=false;
  const closing=new Set();
  return {
    async connect(){
      if(closed) throw Error('Hyperdrive request client has closed');
      let unlock;
      const permit=new Promise(resolve=>{unlock=resolve;});
      const previous=nextLease;
      nextLease=permit;
      await previous;
      if(closed){
        unlock();
        throw Error('Hyperdrive request client has closed');
      }
      const client=createClient({
        connectionString,
        connectionTimeoutMillis:options?.connectionTimeoutMs??5_000,
        statement_timeout:options?.statementTimeoutMs??5_000,
      });
      // Only public exception types may enter runtime diagnostics.
      client.on?.('error',error=>{
        console.warn('Cloudflare Hyperdrive request client error',error?.name??'Unknown');
      });
      try{
        await client.connect();
      }catch(error){
        try{await client.end();}catch{}
        unlock();
        throw error;
      }
      let released=false;
      return {
        async query(sql,values){
          if(released) throw Error('Hyperdrive request client was released');
          const result=values===undefined
            ?await client.query(sql)
            :await client.query(sql,[...values]);
          return {rows:result.rows};
        },
        release(){
          if(released) return;
          released=true;
          let cleanup;
          cleanup=Promise.resolve().then(()=>client.end()).catch(()=>{}).finally(()=>{
            closing.delete(cleanup);
            unlock();
          });
          closing.add(cleanup);
        },
      };
    },
    async end(){
      closed=true;
      await nextLease;
      await Promise.all([...closing]);
    },
  };
}

function createHyperdriveDriverPoolV1(connectionString,options){
  const pg=new Pool({
    connectionString,
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
  return {
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
}

// S0 has its own two origin LOGINs; the preexisting Ops LOGIN and global
// transport selection are preserved. Fixed server bindings are not HTTP input.
function seyeonHyperdriveBindingsV1(bindings){
  const ordinary=bindings?.SEYEON_SUBJECT_HYPERDRIVE?.connectionString;
  const governed=bindings?.SEYEON_GOVERNED_HYPERDRIVE?.connectionString;
  if(typeof ordinary!=='string'||ordinary.length<20||ordinary.length>4096||
     typeof governed!=='string'||governed.length<20||governed.length>4096||ordinary===governed){
    throw Error('Separate SeYeon Hyperdrive bindings unavailable');
  }
  return {ordinary:requireHyperdriveConnectionStringV1(ordinary),
    governed:requireHyperdriveConnectionStringV1(governed)};
}
export function createCloudflareSeyeonSubjectPoolV1(bindings,options){
  const target=seyeonHyperdriveBindingsV1(bindings);
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool:createHyperdriveDriverPoolV1(target.ordinary,options),
    expectedLoginPrincipal:'myeongha_seyeon_subject_login',
  });
}
export function createCloudflareSeyeonGovernedPoolV1(bindings,options){
  const target=seyeonHyperdriveBindingsV1(bindings);
  return createSeyeonGovernedPostgresPoolFromDriverV1({
    driverPool:createHyperdriveDriverPoolV1(target.governed,options),
    expectedPrincipal:SEYEON_GOVERNED_DB_LOGIN_V1,
  });
}
