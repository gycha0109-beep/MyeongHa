// Optional Cloudflare Hyperdrive transport for subject-scoped PostgreSQL.
// Stage 5 default remains the strict direct-TLS path until an independently
// approved Hyperdrive origin has been provisioned and bound via Wrangler.
// Watchtower-Track: ops
import { Pool } from 'pg';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  createNodePostgresSubjectPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import {createSeyeonGovernedPostgresPoolFromDriverV1,SEYEON_GOVERNED_DB_LOGIN_V1} from '../apps/api/src/seyeon-governed-postgres-pool-v1.ts';
import {
  SeyeonG5PrivateCommercePostgresPoolV1,
  SEYEON_G5_PRIVATE_COMMERCE_DB_V1,
} from '../apps/api/src/seyeon-g5-private-commerce-postgres-pool-v1.ts';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../apps/api/src/production-user-data-runtime-config.ts';

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
  const driverPool=createHyperdriveDriverPoolV1(target.connectionString,options);
  // Reuse the existing authoritative LOGIN principal + executable role
  // preflight and the same subject/RLS transaction executor as Vercel.
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool,
    expectedLoginPrincipal:bindings.MYEONGHA_CLOUDFLARE_HYPERDRIVE_PRINCIPAL,
  });
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
// Issued-response receipts and withdrawal must remain available after an
// emergency model/cost stop, even if the separately governed connection is
// missing. Never create or open the governed pool in this privacy path.
export function createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1(bindings,options){
  const ordinary=bindings?.SEYEON_SUBJECT_HYPERDRIVE?.connectionString;
  if(typeof ordinary!=='string'||ordinary.length<20||ordinary.length>4096){
    throw Error('SeYeon withdrawal Subject Hyperdrive binding unavailable');
  }
  const governed=bindings?.SEYEON_GOVERNED_HYPERDRIVE?.connectionString;
  if(typeof governed==='string'&&ordinary===governed){
    throw Error('Privacy Subject and governed cost bindings must remain separate');
  }
  return createNodePostgresSubjectPoolFromDriverV1({
    driverPool:createHyperdriveDriverPoolV1(
      requireHyperdriveConnectionStringV1(ordinary),options,
    ),
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

/**
 * Dedicated G5 Commerce Hyperdrive. It is intentionally absent from Wrangler
 * until the separate LOGIN/secret and role grants have been provisioned.
 * A reused Subject or governed-cost binding is rejected before pool creation.
 */
export function createCloudflareSeyeonG5PrivateCommercePoolV1(bindings,options){
  // Receipt settlement depends on the ordinary Subject authority and the
  // separate Commerce LOGIN, never on the optional governed model-cost pool.
  const ordinaryRaw=bindings?.SEYEON_SUBJECT_HYPERDRIVE?.connectionString;
  const governedRaw=bindings?.SEYEON_GOVERNED_HYPERDRIVE?.connectionString;
  if(typeof ordinaryRaw!=='string'||ordinaryRaw.length<20||ordinaryRaw.length>4096){
    throw Error('SeYeon Subject Hyperdrive binding unavailable for G5 preflight');
  }
  const ordinary=requireHyperdriveConnectionStringV1(ordinaryRaw);
  let governed=null;
  if(typeof governedRaw==='string'&&governedRaw.length>=20&&governedRaw.length<=4096){
    // Proof receipt settlement must not depend on the optional model-cost pool.
    try{governed=requireHyperdriveConnectionStringV1(governedRaw);}catch{governed=null;}
  }
  const raw=bindings?.SEYEON_G5_COMMERCE_HYPERDRIVE?.connectionString;
  if(typeof raw!=='string'||raw.length<20||raw.length>4096){
    throw Error('Dedicated G5 Commerce Hyperdrive binding unavailable');
  }
  if(bindings?.SEYEON_G5_COMMERCE_HYPERDRIVE_ORIGIN_POLICY!=='supabase-verify-full-rls-v1'||
     bindings?.SEYEON_G5_COMMERCE_HYPERDRIVE_PRINCIPAL!==
       SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login){
    throw Error('G5 Commerce Hyperdrive origin policy or dedicated principal marker missing');
  }
  const connectionString=requireHyperdriveConnectionStringV1(raw);
  if(connectionString===ordinary||connectionString===governed){
    throw Error('G5 Commerce must use a dedicated Hyperdrive binding');
  }
  const username=decodeURIComponent(new URL(connectionString).username);
  const qualified=SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login+'.'+
    MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  if(username!==SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login&&username!==qualified){
    throw Error('G5 Commerce Hyperdrive login principal mismatch');
  }
  const commerceUrl=new URL(connectionString);
  const approvedOrigins=[new URL(ordinary),...(governed===null?[]:[new URL(governed)])];
  const sameApprovedOrigin=approvedOrigins.every(origin=>
    commerceUrl.protocol===origin.protocol&&
    commerceUrl.hostname.toLowerCase()===origin.hostname.toLowerCase()&&
    commerceUrl.port===origin.port&&
    commerceUrl.pathname===origin.pathname);
  if(!sameApprovedOrigin||
     commerceUrl.password===new URL(ordinary).password||
     (governed!==null&&commerceUrl.password===new URL(governed).password)){
    throw Error('G5 Commerce must use a distinct secret on the existing approved database origin');
  }
  return new SeyeonG5PrivateCommercePostgresPoolV1(
    createHyperdriveDriverPoolV1(connectionString,options),
  );
}
