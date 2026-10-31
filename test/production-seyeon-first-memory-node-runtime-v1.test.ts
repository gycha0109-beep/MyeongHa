// Watchtower-Track: security
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createProductionSeyeonFirstMemoryNodeRuntimeV1, createProductionSeyeonFirstMemoryExecutionV1 } from '../apps/api/src/production-seyeon-first-memory-node-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { PRODUCTION_USER_DATA_RUNTIME_ENV_V1, MYEONGHA_PRODUCTION_SUPABASE_ORIGIN, PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1 } from '../apps/api/src/production-user-data-runtime-config.js';

describe('first Memory production composition stays closed before credential resolution', () => {
  it.each([false, true])('requires real source/cost admission after DB readiness=%s', async ready => {
    let credentialReads = 0;
    let readinessReads = 0;
    const env: Record<string, string> = {
      [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl]: 'postgresql://myeongha_runtime:synthetic@db.example.internal:5432/postgres?sslmode=require',
      [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal]: 'myeongha_runtime',
      [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl]: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey]: 'sb_publishable_synthetic_runtime_only',
      [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret]: 'synthetic-guest-secret-at-least-thirty-two-bytes',
      [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode]: 'verify-full',
      [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem]: '-----BEGIN CERTIFICATE-----\nsynthetic-only\n-----END CERTIFICATE-----',
    };
    Object.defineProperty(env, 'OPENAI_API_KEY', { get() { credentialReads++; throw Error('No provider credential access'); } });
    const auth = '11111111-1111-4111-8111-111111111111';
    const subject = '22222222-2222-4222-8222-222222222222';
    const pool = { connect: async () => ({
      async query(sql: string) {
        if (sql.includes('begin_member_subject_context_v1')) return { rows: [{ subjectId: subject, subjectKind: 'member' }] };
        if (sql.includes('to_regprocedure')) { readinessReads++; return { rows: [{ ready }] }; }
        return { rows: [] };
      }, release() {},
    }) } as unknown as PostgresSubjectPoolV1;
    const runtime = createProductionSeyeonFirstMemoryNodeRuntimeV1({
      env, pool, memberFetchImpl: async () => Response.json({ id: auth }),
    });
    let complete!: () => void;
    const handled = new Promise<void>(resolve => { complete = resolve; });
    const server = createServer((incoming, response) => {
      void runtime.handleNodeRequest({ incoming, response }).finally(complete);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/33333333-3333-4333-8333-333333333333/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic.member.signature' },
        body: JSON.stringify({ clientTurnId: '44444444-4444-4444-8444-444444444444', text: 'hello' }),
      }).catch(() => null);
      await handled;
      expect(response?.status ?? 503).not.toBe(200);
      expect(credentialReads).toBe(0);
      expect(readinessReads).toBe(1);
      const approved = createProductionSeyeonFirstMemoryExecutionV1({
        env,pool,memberFetchImpl:async()=>Response.json({id:auth}),
        approvedPersonalRecordModelUse:()=>true,
        governorApproval:{} as never,
      });
      try {
        await expect(approved.runtime.run({
          verifiedEvidence:{kind:'member',verifiedAuthUserId:auth},
          threadId:'33333333-3333-4333-8333-333333333333',
          clientTurnId:'44444444-4444-4444-8444-444444444444',text:'hello',
        })).rejects.toThrow('G4 credits and delivery settlement are not mounted');
        expect(credentialReads).toBe(0);
      } finally {await approved.close();}
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await runtime.close();
    }
  });
});
