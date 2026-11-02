import { createServer } from 'node:net';
import { once } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  port: 0, connects: 0, closes: 0, pools: [],
}));
const SECRET = 'synthetic-db-secret-never-reflect';
const ORIGIN = 'https://myeongha.gycha0109.workers.dev';

vi.mock('../workers/cloudflare-auth-db-api.mjs', async importOriginal => ({
  ...(await importOriginal()),
  approvedCloudflareAuthOriginV1: () => ORIGIN,
  approvedCloudflareStage5HandoffV1: () => true,
  approvedCloudflarePostgresTargetV1: () => true,
}));

vi.mock('../apps/api/src/production-user-data-runtime-config.ts', async importOriginal => ({
  ...(await importOriginal()),
  parseProductionUserDataRuntimeConfigV1: () => ({ synthetic: true }),
}));

vi.mock('../apps/api/src/node-postgres-subject-pool.ts', async importOriginal => ({
  ...(await importOriginal()),
  buildProductionNodePostgresPoolConfigV1: () => ({
    max: 1, ssl: { rejectUnauthorized: true },
  }),
}));

vi.mock('../apps/api/src/production-request-identity-verifier.ts', async importOriginal => ({
  ...(await importOriginal()),
  createProductionRequestIdentityVerifierV1: () => ({
    verifyRequestIdentity: async () => ({
      kind: 'guest',
      verifiedGuestTokenHash: 'synthetic-verified-guest-token-hash',
    }),
  }),
}));

vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs', async importOriginal => {
  const { Pool } = await import('pg');
  return {
    ...(await importOriginal()),
    createCloudflareSubjectPoolV1: () => {
      const pg = new Pool({
        host: '127.0.0.1',
        port: state.port,
        database: 'synthetic',
        user: 'synthetic',
        password: SECRET,
        ssl: false,
        max: 1,
        connectionTimeoutMillis: 150,
        allowExitOnIdle: true,
      });
      const pool = {
        async connect() {
          state.connects++;
          return pg.connect();
        },
        async close() {
          state.closes++;
          await pg.end();
        },
      };
      state.pools.push(pool);
      return pool;
    },
  };
});

import {
  tryHandleCloudflareApprovedRecordsV1,
} from '../workers/cloudflare-records-api.mjs';
import worker from '../cloudflare/myeongha-worker.mjs';

async function tcpSink() {
  const sockets = new Set();
  let accepted = 0;
  const server = createServer(socket => {
    accepted++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No synthetic TCP port');
  return {
    port: address.port,
    get accepted() { return accepted; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    },
  };
}

function routeFor(path) {
  const id = {
    '/api/life-record': 'rewrite.life-record',
    '/api/readings': 'rewrite.readings',
    '/api/memories': 'rewrite.memories',
  }[path];
  if (!id) throw Error('Disallowed test route');
  return { id };
}

async function assertUnavailable(path, mode) {
  const request = new Request(ORIGIN + path, {
    method: 'GET',
    headers: { authorization: 'Bearer synthetic-opaque-guest' },
  });
  const started = performance.now();
  const response = await tryHandleCloudflareApprovedRecordsV1(
    request, {}, routeFor(path),
  );
  const duration = performance.now() - started;
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  const body = await response.text();
  expect(JSON.parse(body)).toMatchObject({
    ok: false, error: { code: 'AUTH_UPSTREAM_UNAVAILABLE', retryable: true },
  });
  for (const forbidden of [SECRET, 'synthetic-opaque-guest', '127.0.0.1:', 'postgresql://']) {
    expect(body).not.toContain(forbidden);
  }
  expect(duration).toBeLessThan(2000);
  expect(state.connects).toBe(1);
  expect(state.closes).toBe(1);
  expect(state.pools).toHaveLength(1);
  const health = await worker.fetch(new Request(ORIGIN + '/api/health'), {});
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
  return { mode, path, durationMs: Math.round(duration) };
}

beforeEach(() => {
  state.port = 0;
  state.connects = 0;
  state.closes = 0;
  state.pools = [];
});

describe('Phase 7 owner-scoped Records API: real DB TCP faults with sanitized HTTP 503', () => {
  it.each(['/api/life-record', '/api/readings', '/api/memories'])(
    '%s returns bounded 503 on a refused real TCP socket, while health remains 200',
    async path => {
      const listener = await tcpSink();
      state.port = listener.port;
      await listener.close();
      await assertUnavailable(path, 'refused');
    },
  );

  it.each(['/api/life-record', '/api/readings', '/api/memories'])(
    '%s returns bounded 503 on an accepted socket that stalls the PostgreSQL handshake',
    async path => {
      const listener = await tcpSink();
      state.port = listener.port;
      try {
        await assertUnavailable(path, 'stalled-handshake');
        expect(listener.accepted).toBe(1);
      } finally {
        await listener.close();
      }
    },
  );
});
