import { describe, expect, it, vi } from 'vitest';

import {
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
});
