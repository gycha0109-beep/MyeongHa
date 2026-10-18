// Watchtower-Track: security
// Real TLS 1.3 loopback sockets. Synthetic credentials, DB rows and Provider
// only; no external network, Supabase access, billable AI, or production certs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import type { TLSSocket } from 'node:tls';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  startSeyeonFirstZeroDirectHttpsLoopbackV1,
  SEYEON_FIRST_ZERO_DIRECT_HTTPS_LOOPBACK_HOST_V1,
} from '../apps/api/src/seyeon-first-zero-direct-https-loopback-host-v1.js';

const hostname = 'seyeon.local.test';
const authId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const messageId = '66666666-6666-4666-8666-666666666666';
const clientTurnId = '77777777-7777-4777-8777-777777777777';
const originalText = 'TLS 소켓을 거쳐 전달된 DB 원본';
const untrustedText = 'UNTRUSTED_MODEL_CANARY';

let cert = '';
let key = '';
let scratchDirectory = '';

beforeAll(() => {
  scratchDirectory = mkdtempSync(join(tmpdir(), 'myeongha-direct-node-https-'));
  const certPath = join(scratchDirectory, 'temporary.pem');
  const keyPath = join(scratchDirectory, 'temporary.key');
  // Generated for this test run; no long-lived private key checked into git.
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
    '-days', '1', '-keyout', keyPath, '-out', certPath,
    '-subj', `/CN=${hostname}`, '-addext', `subjectAltName=DNS:${hostname}`,
  ], { stdio: 'ignore' });
  cert = readFileSync(certPath, 'utf8');
  key = readFileSync(keyPath, 'utf8');
});
afterAll(() => {
  if (scratchDirectory) rmSync(scratchDirectory, { recursive: true, force: true });
});

function syntheticDb(ready = true) {
  const events: string[] = [];
  let connections = 0;
  const pool = {
    async connect() {
      connections++;
      return {
        async query(sql: string, args?: readonly unknown[]) {
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
            events.push(sql);
            return { rows: [] };
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            expect(args).toEqual([authId]);
            return { rows: [{ subjectId, subjectKind: 'member' }] };
          }
          if (sql.includes('from pg_catalog.pg_proc p') &&
              sql.includes('qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('readiness');
            return { rows: [{ ready }] };
          }
          if (sql.includes('from public.qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('locked-sql');
            expect(args).toEqual([subjectId, threadId, turnId, attemptId]);
            return { rows: [{ assistantText: originalText }] };
          }
          throw new Error('Unexpected synthetic DB query.');
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  return { pool, events, get connections() { return connections; } };
}

function committedResult() {
  return {
    subjectId,
    threadBinding: { threadId },
    execution: {
      disposition: 'executed',
      receivedTurn: { turnId },
      committedTurn: {
        turnId, attemptId, assistantMessageId: messageId,
        sequenceNo: 2, replayed: false,
      },
      get runtimeResult() { throw new Error('Untrusted Provider payload must not be read.'); },
      get assistantText() { return untrustedText; },
    },
  } as never;
}

type Verify = IdentityEvidenceVerificationPortV1['verifyRequestIdentity'];
type Runtime = Pick<ProductionSeyeonChatRuntimeV1, 'run'>;

async function exchange(input: {
  verify?: Verify;
  db?: ReturnType<typeof syntheticDb>;
  runtime?: Runtime;
  hostHeader?: string;
  servername?: string;
  headers?: Record<string,string | string[]>;
  alpn?: readonly string[];
  method?: string;
  payload?: unknown;
  verifyServerCertificate?: boolean;
}) {
  const db = input.db ?? syntheticDb();
  let verifyCalls = 0;
  let runtimeCalls = 0;
  const lease = await startSeyeonFirstZeroDirectHttpsLoopbackV1({
    certificatePem: cert,
    privateKeyPem: key,
    expectedDnsHost: hostname,
    identityEvidenceVerifier: { verifyRequestIdentity: async req => {
      verifyCalls++;
      return input.verify === undefined
        ? { kind: 'member' as const, verifiedAuthUserId: authId }
        : input.verify(req);
    }},
    pool: db.pool,
    runtime: { run: async runInput => {
      runtimeCalls++;
      return input.runtime === undefined ? committedResult() : input.runtime.run(runInput);
    }},
  });
  try {
    const response = await new Promise<{ status: number; body: string; tlsVersion: string | null }>((resolve,reject) => {
      const outgoing = httpsRequest({
        hostname: '127.0.0.1', port: lease.port,
        servername: input.servername ?? hostname,
        method: input.method ?? 'POST',
        path: `/api/chat/${threadId}/turns`,
        headers: {
          Host: input.hostHeader ?? hostname,
          Authorization: 'Bearer synthetic-member',
          'Content-Type': 'application/json',
          ...input.headers,
        },
        ca: cert,
        rejectUnauthorized: input.verifyServerCertificate ?? true,
        ALPNProtocols: input.alpn === undefined ? ['http/1.1'] : [...input.alpn],
      }, res => {
        const chunks: Buffer[] = [];
        const version = (res.socket as TLSSocket).getProtocol();
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          tlsVersion: version,
        }));
        res.on('error', reject);
      });
      outgoing.on('error', reject);
      if (input.method !== 'GET') {
        outgoing.end(JSON.stringify(input.payload ?? { clientTurnId, text: ' 안녕 세연 ' }));
      } else {
        outgoing.end();
      }
    });
    return {
      ...response,
      json: response.body ? JSON.parse(response.body) as Record<string,any> : null,
      verifyCalls,
      runtimeCalls,
      db,
    };
  } finally {
    await lease.close();
  }
}

describe('direct HTTPS TLS-only synthetic Node host', () => {
  it('never binds a public interface or declares Vercel/proxy approval', () => {
    expect(SEYEON_FIRST_ZERO_DIRECT_HTTPS_LOOPBACK_HOST_V1).toMatchObject({
      bindAddress: '127.0.0.1',
      tlsMinimum: 'TLSv1.3',
      publicRouteMounted: false,
      vercelFetchSupported: false,
      reverseProxySupported: false,
      independentlyApprovedForProduction: false,
    });
  });

  it('completes real TLS 1.3 + SNI + JWT-verified Member preflight -> DB original -> finish, without model body serialization', async () => {
    const db = syntheticDb();
    const res = await exchange({ db, runtime: { run: async args => {
      db.events.push('model');
      expect(args.text).toBe('안녕 세연');
      expect(args.verifiedEvidence).toEqual({ kind: 'member', verifiedAuthUserId: authId });
      return committedResult();
    }}});
    expect(res.tlsVersion).toBe('TLSv1.3');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      ok: true,
      data: { turnId, assistantMessageId: messageId, assistantText: originalText },
    });
    expect(res.body).not.toContain(untrustedText);
    expect(db.events.indexOf('readiness')).toBeLessThan(db.events.indexOf('model'));
    expect(db.events.indexOf('model')).toBeLessThan(db.events.indexOf('locked-sql'));
    expect(db.events.slice(-2)).toEqual(['COMMIT','release']);
    expect(db.connections).toBe(2);
  });

  it.each<[string, {
    hostHeader?: string;
    headers?: Record<string,string | string[]>;
    alpn?: readonly string[];
  }]>([
    ['wrong-host', { hostHeader: 'unexpected.local.test' }],
    ['forwarded-proxy', { headers: { 'X-Forwarded-For': '127.0.0.1' } }],
    ['duplicate-auth', { headers: { Authorization: ['Bearer memberA','Bearer memberB'] } }],
    ['alpn-missing', { alpn: [] }],
  ])('%s is rejected at TLS/Host admission before Member or DB', async (_, props) => {
    const res = await exchange(props);
    expect(res.status).toBe(503);
    expect(res.json?.error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
    expect(res.verifyCalls).toBe(0);
    expect(res.runtimeCalls).toBe(0);
    expect(res.db.connections).toBe(0);
    expect(res.body).not.toContain(originalText);
  });

  it('rejects unknown SNI even when the test client intentionally bypasses certificate validation', async () => {
    const res = await exchange({
      servername: 'unrecognized.local.test',
      verifyServerCertificate: false,
    });
    expect(res.status).toBe(503);
    expect(res.verifyCalls).toBe(0);
    expect(res.db.connections).toBe(0);
  });

  it('passes validated guest/invalid payload denials without any paid call', async () => {
    const guest = await exchange({
      verify: async () => ({ kind: 'guest', verifiedGuestTokenHash: 'synthetic' }),
    });
    expect(guest.status).toBe(403);
    expect(guest.runtimeCalls).toBe(0);
    expect(guest.db.connections).toBe(0);
    const malformed = await exchange({ payload: {
      clientTurnId, text: 'no', subjectId: 'forged',
    }});
    expect(malformed.status).toBe(400);
    expect(malformed.runtimeCalls).toBe(0);
    expect(malformed.db.connections).toBe(0);
  });

  it('holds without provider call when the DB owner function is missing/unready', async () => {
    const res = await exchange({ db: syntheticDb(false) });
    expect(res.status).toBe(503);
    expect(res.runtimeCalls).toBe(0);
    expect(res.db.connections).toBe(1);
    expect(res.body).not.toContain(originalText);
  });
});
