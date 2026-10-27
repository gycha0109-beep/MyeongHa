// Independent deployment. Never mounted by the public user Worker.
import { Pool } from 'pg';
import { createAdminAccessGateV1 } from '../apps/api/src/admin-access-gate-v1.ts';
import { createAdminHostedHttpV1 } from '../apps/api/src/admin-hosted-http-v1.ts';
import { createAdminPrivateRuntimeV1 } from '../apps/api/src/admin-private-runtime-v1.ts';

export default {
  async fetch(request, env, ctx) {
    let reader; let audit;
    try {
      if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true' || env.MYEONGHA_ADMIN_HYPERDRIVE_POLICY !== 'dedicated-admin-verify-full-v1' ||
          !env.ADMIN_READ_HYPERDRIVE?.connectionString || !env.ADMIN_AUDIT_HYPERDRIVE?.connectionString || !env.ADMIN_RATE_LIMITER) throw Error('Unconfigured');
      const gate = createAdminAccessGateV1({ issuer: env.MYEONGHA_ADMIN_ACCESS_ISSUER, audience: env.MYEONGHA_ADMIN_ACCESS_AUD,
        ownerEmail: env.MYEONGHA_ADMIN_OWNER_EMAIL });
      // Gate before opening any database connection, including static assets.
      if (!await gate(request)) return Response.json({ error:'ADMIN_ACCESS_REQUIRED' }, {status:403,headers:{'Cache-Control':'no-store'}});
      reader = new Pool({connectionString:env.ADMIN_READ_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
      audit = new Pool({connectionString:env.ADMIN_AUDIT_HYPERDRIVE.connectionString,max:1,connectionTimeoutMillis:3000,statement_timeout:5000});
      const runtime = createAdminPrivateRuntimeV1({env,readPool:reader,auditPool:audit});
      const handler = createAdminHostedHttpV1({origin:env.MYEONGHA_ADMIN_ORIGIN,memberAuthOrigin:env.MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN,
        verifyAccess:async()=>true, // The signed, exact Owner gate already ran above.
        allowRequest:async()=>Boolean((await env.ADMIN_RATE_LIMITER.limit({key:env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID})).success),
        api:runtime.handleRequest,assets:request=>env.ASSETS.fetch(request)});
      return await handler(request);
    } catch { return Response.json({error:'ADMIN_HOSTED_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    finally { if(reader||audit) ctx.waitUntil(Promise.allSettled([reader?.end(),audit?.end()])); }
  },
};
