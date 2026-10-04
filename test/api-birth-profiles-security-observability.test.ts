import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { createBirthProfilesVercelHandlerV1 } from '../api/birth-profiles.js';
import type { SecurityEventV1 } from '../apps/api/src/security-observability.js';

class CaptureResponse extends PassThrough {
  statusCode = 200;
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
}

function createRequest(method = 'POST') {
  return {
    method,
    url: '/api/birth-profiles',
    headers: {
      authorization: 'Bearer must-never-be-logged',
      cookie: 'session=must-never-be-logged',
    },
    body: {
      email: 'secret@example.com',
      birthDate: '1990-01-01',
    },
  };
}

describe('birth-profiles Node security observability boundary', () => {
  it('records a privacy-safe access-denied event for the create route', async () => {
    const events: SecurityEventV1[] = [];
    const response = new CaptureResponse();
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));

    const handler = createBirthProfilesVercelHandlerV1({
      getReadRuntime: () => ({
        async handleRequest() {
          return new Response(null, { status: 200 });
        },
      }),
      getCreateRuntime: () => ({
        async handleRequest() {
          return Response.json(
            { ok: false },
            { status: 401, headers: { 'Cache-Control': 'no-store' } },
          );
        },
      }),
      requestIdFactory: () => 'birth-node-access-denied',
      now: vi.fn()
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_025),
      eventWriter: (event) => events.push(event),
    });

    await handler(createRequest(), response);

    expect(response.statusCode).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.concat(chunks).toString('utf8')).toContain('"ok":false');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventCode: 'ACCESS_DENIED',
      routeId: 'api.birth-profiles',
      method: 'POST',
      status: 401,
      requestId: 'birth-node-access-denied',
    });

    const serialized = JSON.stringify(events);
    for (const forbidden of [
      'Bearer',
      'must-never-be-logged',
      'session=',
      'secret@example.com',
      '1990-01-01',
      'birthDate',
      '/api/birth-profiles',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('turns runtime initialization failure into a generic no-store 500', async () => {
    const events: SecurityEventV1[] = [];
    const response = new CaptureResponse();
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));

    const handler = createBirthProfilesVercelHandlerV1({
      getReadRuntime: () => {
        throw new Error('read runtime secret');
      },
      getCreateRuntime: () => {
        throw new Error('database password=must-not-escape');
      },
      requestIdFactory: () => 'birth-node-runtime-failure',
      now: vi.fn()
        .mockReturnValueOnce(2_000)
        .mockReturnValueOnce(2_050),
      eventWriter: (event) => events.push(event),
    });

    await handler(createRequest(), response);

    expect(response.statusCode).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.concat(chunks).toString('utf8')).toBe('');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventCode: 'UNEXPECTED_EXCEPTION',
      routeId: 'api.birth-profiles',
      status: 500,
    });
    expect(JSON.stringify(events)).not.toContain('password');
    expect(JSON.stringify(events)).not.toContain('must-not-escape');
  });

  it('does not emit security noise for successful create responses', async () => {
    const events: SecurityEventV1[] = [];
    const response = new CaptureResponse();

    const handler = createBirthProfilesVercelHandlerV1({
      getReadRuntime: () => ({
        async handleRequest() {
          return new Response(null, { status: 200 });
        },
      }),
      getCreateRuntime: () => ({
        async handleRequest() {
          return new Response(null, { status: 201 });
        },
      }),
      requestIdFactory: () => 'birth-node-success',
      now: vi.fn()
        .mockReturnValueOnce(3_000)
        .mockReturnValueOnce(3_010),
      eventWriter: (event) => events.push(event),
    });

    await handler(createRequest(), response);

    expect(response.statusCode).toBe(201);
    expect(events).toEqual([]);
  });
});
