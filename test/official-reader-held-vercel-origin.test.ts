import { describe, expect, it, vi } from 'vitest';

// The production dispatcher is intentionally held OFF. Stub ONLY the S7 ACK
// handler to inspect the exact request it would receive after Vercel routing.
vi.mock('../apps/api/src/official-reader-paid-chat-delivery-ack-http-v1.js', () => ({
  handleOfficialReaderPaidDeliveryAckHttpV1: vi.fn(async (input: {
    request: Request;
    paidReadReleaseEnabled: boolean;
  }) => Response.json({
    url: input.request.url,
    origin: input.request.headers.get('Origin'),
    ackHeader: input.request.headers.get('X-Reader-Delivery-Ack'),
    method: input.request.method,
    body: await input.request.text(),
    releaseEnabled: input.paidReadReleaseEnabled,
  })),
}));

import { tryDispatchHeldOfficialReaderV1 } from '../apps/api/src/official-reader-held-vercel-dispatch-v1.js';

const THREAD='11111111-1111-4111-8111-111111111111';
const MESSAGE='22222222-2222-4222-8222-222222222222';
const url='https://myeongha.example/api/me?__myeongha_held_reader_route=ack' +
  '&__myeongha_held_reader_thread_id=' + THREAD +
  '&__myeongha_held_reader_message_id=' + MESSAGE;

async function dispatched(origin: string) {
  const request = new Request(url, {
    method:'POST',
    headers: {
      'Content-Type':'application/json',
      Origin:origin,
      'X-Reader-Delivery-Ack':'1',
    },
    body: JSON.stringify({safeMarker:'synthetic'}),
  });
  const response=tryDispatchHeldOfficialReaderV1({
    request,requestId:'s7-origin-regression',serverTime:'2026-10-25T00:00:00.000Z',
  });
  expect(response).not.toBeNull();
  return (await (await response!).json()) as Record<string,unknown>;
}

describe('S7 Vercel held dispatcher preserves external request origin', () => {
  it('passes the real same-origin URL to ACK validation without enabling paid release', async()=>{
    expect(await dispatched('https://myeongha.example')).toEqual({
      url: `https://myeongha.example/api/chat/${THREAD}/paid-readings/${MESSAGE}/ack`,
      origin:'https://myeongha.example',
      ackHeader:'1',
      method:'POST',
      body:'{"safeMarker":"synthetic"}',
      releaseEnabled:false,
    });
  });
  it('preserves (does not forge or normalize away) a cross-site Origin for denial', async()=>{
    const forwarded=await dispatched('https://evil.example');
    expect(forwarded.origin).toBe('https://evil.example');
    expect(new URL(String(forwarded.url)).origin).toBe('https://myeongha.example');
    expect(forwarded.releaseEnabled).toBe(false);
  });
});
