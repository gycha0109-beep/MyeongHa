import { createServer, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { buildNodePostgresPoolConfigV1 } from '../apps/api/src/node-postgres-subject-pool.js';
// @ts-expect-error Cloudflare Worker JavaScript entrypoint has no TypeScript declaration.
import worker from '../cloudflare/myeongha-worker.mjs';

const CONNECT_TIMEOUT_MS = 125;
const POOL_SIZE = 1;

async function localTcpSink() {
  const sockets = new Set<Socket>();
  let connections = 0;
  let peak = 0;
  const server: Server = createServer(socket => {
    connections += 1;
    sockets.add(socket);
    peak = Math.max(peak, sockets.size);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw Error('No loopback TCP port');
  return {
    port: address.port,
    get connections() { return connections; },
    get peak() { return peak; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
    },
  };
}

function localPool(port: number) {
  const config = buildNodePostgresPoolConfigV1(
    'postgres://synthetic:synthetic@127.0.0.1:' + port + '/synthetic?sslmode=disable',
    {
      maxConnectionsPerRuntime: POOL_SIZE,
      connectionTimeoutMs: CONNECT_TIMEOUT_MS,
      statementTimeoutMs: 500,
      idleTimeoutMs: 1000,
    },
  );
  expect(config.max).toBe(POOL_SIZE);
  expect(config.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_MS);
  expect(config.statement_timeout).toBe(500);
  return new Pool(config);
}

async function expectHealth() {
  const response = await worker.fetch(
    new Request('https://myeongha.gycha0109.workers.dev/api/health'),
    {},
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
}

describe('Phase 7: non-production DB TCP failure isolation', () => {
  it('rejects a refused PostgreSQL socket without degrading Worker liveness', async () => {
    const listener = await localTcpSink();
    const port = listener.port;
    await listener.close();
    const pool = localPool(port);
    try {
      const started = performance.now();
      await expect(pool.connect()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      expect(performance.now() - started).toBeLessThan(2000);
      await expectHealth();
    } finally {
      await pool.end();
    }
  });

  it('bounds a reachable TCP socket with a stalled PostgreSQL handshake', async () => {
    const listener = await localTcpSink();
    const pool = localPool(listener.port);
    try {
      const started = performance.now();
      await expect(pool.connect()).rejects.toThrow();
      expect(performance.now() - started).toBeLessThan(2000);
      expect(listener.connections).toBe(1);
      await expectHealth();
    } finally {
      await pool.end();
      await listener.close();
    }
  });

  it('does not exceed the configured DB connection budget under concurrent demand', async () => {
    const listener = await localTcpSink();
    const pool = localPool(listener.port);
    try {
      const started = performance.now();
      const outcomes = await Promise.allSettled([
        pool.connect(), pool.connect(), pool.connect(), pool.connect(),
      ]);
      expect(outcomes).toHaveLength(4);
      expect(outcomes.every(result => result.status === 'rejected')).toBe(true);
      expect(performance.now() - started).toBeLessThan(2000);
      expect(listener.connections).toBeGreaterThanOrEqual(1);
      expect(listener.peak).toBeLessThanOrEqual(POOL_SIZE);
      expect(pool.totalCount).toBeLessThanOrEqual(POOL_SIZE);
      await expectHealth();
    } finally {
      await pool.end();
      await listener.close();
    }
  });
});
