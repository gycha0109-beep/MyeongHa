// Independent deployment. Never mounted by the public user Worker.
import { Pool } from 'pg';
import { createAdminAccessGateV1 } from '../apps/api/src/admin-access-gate-v1.ts';
import { createAdminHostedHttpV1 } from '../apps/api/src/admin-hosted-http-v1.ts';
import { createAdminPrivateRuntimeV1 } from '../apps/api/src/admin-private-runtime-v1.ts';
import {createAdminAuditRetentionMaintenanceV1} from '../apps/api/src/admin-audit-retention-v1.ts';
import {createAdminAnalyticsPostgresEventStoreV1} from '../apps/api/src/admin-analytics-pipeline-postgres-v1.ts';
import {validateAdminHttpBindingsV1,validateAdminMaintenanceOriginsV1} from '../apps/admin/worker-binding-guard.mjs';

/** Check *all* selected maintenance origins before the first SQL query starts.
 * Different bindings that resolve to the same privileged DB connection are
 * not a valid substitute for dedicated least-privilege retention roles. */
export function validateAdminMaintenanceBindingsV1(env) {
  const auditEnabled=env.MYEONGHA_ADMIN_RETENTION_ENABLED==='true';
  const analyticsEnabled=env.MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED==='true';
  if(!auditEnabled&&!analyticsEnabled)return{auditEnabled,analyticsEnabled};
  if(env.MYEONGHA_ADMIN_HYPERDRIVE_POLICY!=='dedicated-admin-verify-full-v1')
    throw Error('Dedicated retention policy unavailable');
  const audit=env.ADMIN_RETENTION_HYPERDRIVE?.connectionString;
  const analytics=env.ADMIN_ANALYTICS_RETENTION_HYPERDRIVE?.connectionString;
  if(auditEnabled&&!audit)throw Error('Dedicated audit retention origin unavailable');
  if(analyticsEnabled&&!analytics)throw Error('Dedicated analytics retention origin unavailable');
  const selected=[...(auditEnabled?[audit]:[]),...(analyticsEnabled?[analytics]:[])];
  const other=[env.ADMIN_READ_HYPERDRIVE?.connectionString,env.ADMIN_AUDIT_HYPERDRIVE?.connectionString,
    env.ADMIN_COMMAND_HYPERDRIVE?.connectionString].filter(Boolean);
  validateAdminMaintenanceOriginsV1(selected,other);
  return{auditEnabled,analyticsEnabled};
}

/** A Workers-native Cloudflare Access identity is verified by Cloudflare before
 * it reaches ctx.access. Recheck this app's audience and the single Owner email.
 * Keep the independent signed JWT verifier for direct/header-based requests. */
export async function verifyAdminWorkerOwnerAccessV1(request,env,ctx) {
  let gateReason='unspecified';
  const gate=createAdminAccessGateV1({issuer:env.MYEONGHA_ADMIN_ACCESS_ISSUER,
    audience:env.MYEONGHA_ADMIN_ACCESS_AUD,ownerEmail:env.MYEONGHA_ADMIN_OWNER_EMAIL},
    {onDenied:reason=>{gateReason=reason;}});
  if(await gate(request))return true;
  // Cloudflare Access for Workers may supply its verified identity as ctx.access
  // without making the JWT header available to this Worker invocation.
  const access=ctx?.access;
  let workerReason='context_unavailable';
  if(access){
    if(access.aud!==env.MYEONGHA_ADMIN_ACCESS_AUD)workerReason='context_audience_invalid';
    else if(typeof access.getIdentity!=='function')workerReason='context_identity_unavailable';
    else try {
      const identity=await access.getIdentity();
      if(typeof identity?.email==='string'&&
        identity.email.toLowerCase()===env.MYEONGHA_ADMIN_OWNER_EMAIL.toLowerCase())return true;
      workerReason='context_owner_invalid';
    }catch{workerReason='context_identity_lookup_failed';}
  }
  // Private stage only: persist reason codes, never tokens, cookies, email,
  // claim payloads, request URLs or other personal information.
  if(env.MYEONGHA_ADMIN_PRIVATE_ENABLED!=='true'){
    const source=request.headers.has('cf-access-jwt-assertion')?'assertion':
      request.headers.get('cookie')?.split(';').some(p=>p.trim().startsWith('CF_Authorization='))?'cookie':'none';
    console.warn('ADMIN_ACCESS_DIAGNOSTIC_V1', {source,gateReason,workerReason});
  }
  return false;
}

export default {
  async scheduled(_event,env,ctx){
    const {auditEnabled,analyticsEnabled}=validateAdminMaintenanceBindingsV1(env);
    if(!auditEnabled&&!analyticsEnabled)return;
    const jobs=[];
    if(auditEnabled){
      jobs.push((async()=>{const pool=new Pool({connectionString:env.ADMIN_RETENTION_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
        try{const purge=createAdminAuditRetentionMaintenanceV1(pool);for(let batch=0;batch<10;batch++){
          const result=await purge(1000);if(result.deleted<1000)return;
        }throw Error('Audit retention backlog requires another bounded run');}finally{await pool.end();}})());
    }
    if(analyticsEnabled){
      jobs.push((async()=>{const pool=new Pool({connectionString:env.ADMIN_ANALYTICS_RETENTION_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
        try{const store=createAdminAnalyticsPostgresEventStoreV1(pool);for(let batch=0;batch<10;batch++){
          const deleted=await store.purgeExpired(new Date().toISOString());
          // A partial batch does not mean the OTHER table is drained. A run
          // continues until both expired cohorts are empty or its bounded cap.
          if(deleted===0)return; // Up to 1000 events and 1000 consents per transaction.
        }throw Error('Analytics retention backlog requires another bounded run');}finally{await pool.end();}})());
    }
    ctx.waitUntil(Promise.all(jobs));
  },
  async fetch(request, env, ctx) {
    let reader; let audit; let command;
    try {
      // Verify the signed header or Cloudflare's own authenticated Worker context
      // before opening any database connection, including static assets.
      if (!await verifyAdminWorkerOwnerAccessV1(request,env,ctx)) return Response.json({ error:'ADMIN_ACCESS_REQUIRED' }, {status:403,headers:{'Cache-Control':'no-store'}});
      // Inactive staging still verifies the Access-authenticated Owner identity.
      // A verified Owner gets a distinct disabled response, with no DB or asset I/O.
      if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true') return Response.json({error:'ADMIN_PRIVATE_DISABLED'},
        {status:503,headers:{'Cache-Control':'no-store'}});
      if (env.MYEONGHA_ADMIN_HYPERDRIVE_POLICY !== 'dedicated-admin-verify-full-v1' ||
          !env.ADMIN_READ_HYPERDRIVE?.connectionString || !env.ADMIN_AUDIT_HYPERDRIVE?.connectionString || !env.ADMIN_RATE_LIMITER) throw Error('Unconfigured');
      // Access has authenticated the Owner. Before a single SQL query can run,
      // reject any aliased Reader/Audit/Command/Retention credential, even
      // when Wrangler assigned different binding names.
      validateAdminHttpBindingsV1(env);
      reader = new Pool({connectionString:env.ADMIN_READ_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
      audit = new Pool({connectionString:env.ADMIN_AUDIT_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
      if(env.ADMIN_COMMAND_HYPERDRIVE?.connectionString){
        if(typeof env.MYEONGHA_ADMIN_CONFIRMATION_SECRET!=='string'||env.MYEONGHA_ADMIN_CONFIRMATION_SECRET.length<32)throw Error('Command confirmation unavailable');
        command=new Pool({connectionString:env.ADMIN_COMMAND_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
      }
      const runtime = createAdminPrivateRuntimeV1({env,readPool:reader,auditPool:audit,...(command?{commandPool:command}:{})});
      const handler = createAdminHostedHttpV1({origin:env.MYEONGHA_ADMIN_ORIGIN,memberAuthOrigin:env.MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN,
        verifyAccess:async()=>true, // The signed, exact Owner gate already ran above.
        allowRequest:async()=>Boolean((await env.ADMIN_RATE_LIMITER.limit({key:env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID})).success),
        api:runtime.handleRequest,assets:request=>env.ASSETS.fetch(request)});
      return await handler(request);
    } catch { return Response.json({error:'ADMIN_HOSTED_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    finally { if(reader||audit||command) ctx.waitUntil(Promise.allSettled([reader?.end(),audit?.end(),command?.end()])); }
  },
};
