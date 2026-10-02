import { describe, expect, it, vi } from 'vitest';

import {
  executeSecurityObservedNodeRequestV1,
  executeSecurityObservedRequestV1,
  SECURITY_EVENT_SCHEMA_VERSION_V1,
  type SecurityEventV1,
} from '../apps/api/src/security-observability.js';

function harness(status: number) {
  const events: SecurityEventV1[] = [];
  let tick = 1_000;
  return {
    events,
    run: () =>
      executeSecurityObservedRequestV1({
        request: new Request('https://myeongha.test/api/test', {
          method: 'POST',
          headers: {
            authorization: 'Bearer must-never-be-logged',
            cookie: 'session=must-never-be-logged',
          },
          body: JSON.stringify({
            email: 'secret@example.com',
            birthDate: '1990-01-01',
          }),
        }),
        routeId: 'api.test',
        requestIdFactory: () => '11111111-1111-4111-8111-111111111111',
        now: () => {
          tick += 25;
          return tick;
        },
        eventWriter: (event) => events.push(event),
        execute: async () => new Response(null, { status }),
      }),
  };
}

describe('security observability boundary v1', () => {
  it('stays quiet for successful requests', async () => {
    const h = harness(204);
    const response = await h.run();

    expect(response.status).toBe(204);
    expect(h.events).toEqual([]);
  });

  it.each([
    [401, 'ACCESS_DENIED', 'warning', ['A09:2025']],
    [403, 'ACCESS_DENIED', 'warning', ['A09:2025']],
    [429, 'RATE_LIMITED', 'warning', ['A09:2025']],
    [503, 'SERVER_FAILURE', 'error', ['A09:2025', 'A10:2025']],
  ] as const)('classifies security-relevant status %s', async (status, code, severity, owasp) => {
    const h = harness(status);
    const response = await h.run();

    expect(response.status).toBe(status);
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toEqual({
      schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
      owasp,
      eventCode: code,
      severity,
      routeId: 'api.test',
      method: 'POST',
      status,
      requestId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '1970-01-01T00:00:01.050Z',
      durationMs: 25,
    });
  });

  it('converts unexpected exceptions into a generic no-store 500 and emits one bounded event', async () => {
    const events: SecurityEventV1[] = [];
    const response = await executeSecurityObservedRequestV1({
      request: new Request('https://myeongha.test/api/auth/sign-in', {
        method: 'POST',
      }),
      routeId: 'api.auth.sign-in',
      requestIdFactory: () => '22222222-2222-4222-8222-222222222222',
      now: vi.fn()
        .mockReturnValueOnce(2_000)
        .mockReturnValueOnce(2_125),
      eventWriter: (event) => events.push(event),
      execute: async () => {
        throw new Error('database password=never-log-this');
      },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
    expect(events).toEqual([
      {
        schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
        owasp: ['A09:2025', 'A10:2025'],
        eventCode: 'UNEXPECTED_EXCEPTION',
        severity: 'error',
        routeId: 'api.auth.sign-in',
        method: 'POST',
        status: 500,
        requestId: '22222222-2222-4222-8222-222222222222',
        occurredAt: '1970-01-01T00:00:02.125Z',
        durationMs: 125,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('password');
    expect(JSON.stringify(events)).not.toContain('never-log-this');
  });

  it('never copies URL, query, headers, body, error message, or stack into the event schema', async () => {
    const h = harness(403);
    await h.run();

    const serialized = JSON.stringify(h.events[0]);
    for (const forbidden of [
      'myeongha.test',
      '/api/test',
      'authorization',
      'Bearer',
      'cookie',
      'session=',
      'secret@example.com',
      'birthDate',
      '1990-01-01',
      'stack',
      'message',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(h.events[0] ?? {}).sort()).toEqual([
      'durationMs',
      'eventCode',
      'method',
      'occurredAt',
      'owasp',
      'requestId',
      'routeId',
      'schemaVersion',
      'severity',
      'status',
    ]);
  });

  it('rejects dynamic-looking route identifiers before executing application code', async () => {
    const execute = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(
      executeSecurityObservedRequestV1({
        request: new Request('https://myeongha.test/api/test'),
        routeId: '/api/users/123?email=secret@example.com',
        execute,
      }),
    ).rejects.toThrow('bounded static key');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects request identifiers that could carry user-controlled material', async () => {
    const execute = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(
      executeSecurityObservedRequestV1({
        request: new Request('https://myeongha.test/api/test'),
        routeId: 'api.test',
        requestIdFactory: () => 'request?email=secret@example.com',
        execute,
      }),
    ).rejects.toThrow('bounded opaque key');
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps application responses authoritative when the event writer fails', async () => {
    const response = await executeSecurityObservedRequestV1({
      request: new Request('https://myeongha.test/api/test', { method: 'POST' }),
      routeId: 'api.test',
      requestIdFactory: () => 'writer-failure-request',
      now: vi.fn()
        .mockReturnValueOnce(3_000)
        .mockReturnValueOnce(3_020),
      eventWriter: () => {
        throw new Error('logging backend unavailable');
      },
      execute: async () => new Response(null, { status: 503 }),
    });

    expect(response.status).toBe(503);
  });

  it('still returns generic 500 when both application and event writer fail', async () => {
    const response = await executeSecurityObservedRequestV1({
      request: new Request('https://myeongha.test/api/test', { method: 'POST' }),
      routeId: 'api.test',
      requestIdFactory: () => 'double-failure-request',
      now: vi.fn()
        .mockReturnValueOnce(4_000)
        .mockReturnValueOnce(4_025),
      eventWriter: () => {
        throw new Error('logging backend unavailable');
      },
      execute: async () => {
        throw new Error('application secret must not escape');
      },
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('supports the Node adapter boundary without exposing request material', async () => {
    const events: SecurityEventV1[] = [];
    const written: Response[] = [];

    await executeSecurityObservedNodeRequestV1({
      method: 'POST',
      routeId: 'api.birth-profiles',
      requestIdFactory: () => 'node-request',
      now: vi.fn()
        .mockReturnValueOnce(5_000)
        .mockReturnValueOnce(5_040),
      eventWriter: (event) => events.push(event),
      execute: async () => new Response(null, { status: 401 }),
      writeResponse: async (response) => {
        written.push(response);
      },
    });

    expect(written).toHaveLength(1);
    expect(written[0]?.status).toBe(401);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventCode: 'ACCESS_DENIED',
      routeId: 'api.birth-profiles',
      method: 'POST',
      status: 401,
      requestId: 'node-request',
    });
  });

  it('records a Node response-write exception and propagates a sanitized transport error', async () => {
    const events: SecurityEventV1[] = [];

    await expect(
      executeSecurityObservedNodeRequestV1({
        method: 'GET',
        routeId: 'api.birth-profiles',
        requestIdFactory: () => 'node-write-failure',
        now: vi.fn()
          .mockReturnValueOnce(6_000)
          .mockReturnValueOnce(6_015)
          .mockReturnValueOnce(6_030),
        eventWriter: (event) => events.push(event),
        execute: async () => new Response(null, { status: 200 }),
        writeResponse: async () => {
          throw new Error('socket secret should not be propagated');
        },
      }),
    ).rejects.toThrow('Security-observed Node response write failed.');

    expect(events).toEqual([
      {
        schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
        owasp: ['A09:2025', 'A10:2025'],
        eventCode: 'UNEXPECTED_EXCEPTION',
        severity: 'error',
        routeId: 'api.birth-profiles',
        method: 'GET',
        status: 500,
        requestId: 'node-write-failure',
        occurredAt: '1970-01-01T00:00:06.030Z',
        durationMs: 30,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('socket secret');
  });

  it('writes a generic Node 500 when application execution throws', async () => {
    const events: SecurityEventV1[] = [];
    const written: Response[] = [];

    await executeSecurityObservedNodeRequestV1({
      method: 'POST',
      routeId: 'api.birth-profiles',
      requestIdFactory: () => 'node-runtime-failure',
      now: vi.fn()
        .mockReturnValueOnce(7_000)
        .mockReturnValueOnce(7_050),
      eventWriter: (event) => events.push(event),
      execute: async () => {
        throw new Error('birth payload must not escape');
      },
      writeResponse: async (response) => {
        written.push(response);
      },
    });

    expect(written).toHaveLength(1);
    expect(written[0]?.status).toBe(500);
    expect(written[0]?.headers.get('cache-control')).toBe('no-store');
    expect(await written[0]?.text()).toBe('');
    expect(events).toHaveLength(1);
    expect(events[0]?.eventCode).toBe('UNEXPECTED_EXCEPTION');
    expect(JSON.stringify(events)).not.toContain('birth payload');
  });


  it('sanitizes Node fallback write failures after an application exception', async () => {
    await expect(
      executeSecurityObservedNodeRequestV1({
        method: 'POST',
        routeId: 'api.birth-profiles',
        requestIdFactory: () => 'node-fallback-write-failure',
        now: vi.fn()
          .mockReturnValueOnce(8_000)
          .mockReturnValueOnce(8_010),
        eventWriter: () => undefined,
        execute: async () => {
          throw new Error('application secret');
        },
        writeResponse: async () => {
          throw new Error('socket secret');
        },
      }),
    ).rejects.toThrow('Security-observed Node fallback response write failed.');
  });
});
