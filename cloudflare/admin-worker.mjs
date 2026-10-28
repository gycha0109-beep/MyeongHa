// Independent deployment. Never mounted by the public user Worker.
import { Pool } from 'pg';
import { createAdminAccessGateV1 } from '../apps/api/src/admin-access-gate-v1.ts';
import { createAdminHostedHttpV1 } from '../apps/api/src/admin-hosted-http-v1.ts';
import { createAdminPrivateRuntimeV1 } from '../apps/api/src/admin-private-runtime-v1.ts';
import {createAdminAuditRetentionMaintenanceV1} from '../apps/api/src/admin-audit-retention-v1.ts';
import {createAdminAnalyticsPostgresEventStoreV1} from '../apps/api/src/admin-analytics-pipeline-postgres-v1.ts';

export default {
  async scheduled(_event,env,ctx){
    const auditEnabled=env.MYEONGHA_ADMIN_RETENTION_ENABLED==='true';
    const analyticsEnabled=env.MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED==='true';
    if(!auditEnabled&&!analyticsEnabled)return;
    if(env.MYEONGHA_ADMIN_HYPERDRIVE_POLICY!=='dedicated-admin-verify-full-v1')throw Error('Dedicated retention policy unavailable');
    const jobs=[];
    if(auditEnabled){
      if(!env.ADMIN_RETENTION_HYPERDRIVE?.connectionString)throw Error('Dedicated audit retention origin unavailable');
      jobs.push((async()=>{const pool=new Pool({connectionString:env.ADMIN_RETENTION_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
        try{const purge=createAdminAuditRetentionMaintenanceV1(pool);for(let batch=0;batch<10;batch++){
          const result=await purge(1000);if(result.deleted<1000)return;
        }throw Error('Audit retention backlog requires another bounded run');}finally{await pool.end();}})());
    }
    if(analyticsEnabled){
      if(!env.ADMIN_ANALYTICS_RETENTION_HYPERDRIVE?.connectionString)throw Error('Dedicated analytics retention origin unavailable');
      jobs.push((async()=>{const pool=new Pool({connectionString:env.ADMIN_ANALYTICS_RETENTION_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
        try{const store=createAdminAnalyticsPostgresEventStoreV1(pool);for(let batch=0;batch<10;batch++){
          const deleted=await store.purgeExpired(new Date().toISOString());
          if(deleted<2000)return; // Up to 1000 events and 1000 consents per transaction.
        }throw Error('Analytics retention backlog requires another bounded run');}finally{await pool.end();}})());
    }
    ctx.waitUntil(Promise.all(jobs));
  },
  async fetch(request, env, ctx) {
    let reader; let audit; let command;
    try {
      if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true' || env.MYEONGHA_ADMIN_HYPERDRIVE_POLICY !== 'dedicated-admin-verify-full-v1' ||
          !env.ADMIN_READ_HYPERDRIVE?.connectionString || !env.ADMIN_AUDIT_HYPERDRIVE?.connectionString || !env.ADMIN_RATE_LIMITER) throw Error('Unconfigured');
      const gate = createAdminAccessGateV1({ issuer: env.MYEONGHA_ADMIN_ACCESS_ISSUER, audience: env.MYEONGHA_ADMIN_ACCESS_AUD,
        ownerEmail: env.MYEONGHA_ADMIN_OWNER_EMAIL });
      // Gate before opening any database connection, including static assets.
      if (!await gate(request)) return Response.json({ error:'ADMIN_ACCESS_REQUIRED' }, {status:403,headers:{'Cache-Control':'no-store'}});
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
