import { describe, expect, it } from 'vitest';
import { tryDispatchHeldOfficialReaderV1 } from '../apps/api/src/official-reader-held-vercel-dispatch-v1.js';

const THREAD = '11111111-1111-4111-8111-111111111111';
const MESSAGE = '22222222-2222-4222-8222-222222222222';
const READING = '33333333-3333-4333-8333-333333333333';

function request(uri: string, method = 'GET', extra?: Record<string, string>): Request {
  return new Request('https://myeongha.example' + uri, {
    method, headers: extra,
  });
}

async function status(uri: string, method = 'GET'): Promise<number | null> {
  const result = tryDispatchHeldOfficialReaderV1({
    request: request(uri, method),
    requestId: 'synthetic-request',
    serverTime: '2026-10-23T00:00:00.000Z',
  });
  return result === null ? null : (await result).status;
}

const message = `/api/me?__myeongha_held_reader_route=message&__myeongha_held_reader_thread_id=${THREAD}&__myeongha_held_reader_message_id=${MESSAGE}`;
const ack = `/api/me?__myeongha_held_reader_route=ack&__myeongha_held_reader_thread_id=${THREAD}&__myeongha_held_reader_message_id=${MESSAGE}`;
const continuity = `/api/me?__myeongha_held_reader_route=continuity&__myeongha_held_reader_reading_id=${READING}&readerCharacterId=baekheon`;

describe('three held Reader production URLs share the governed Vercel dispatcher', () => {
  it('retains hard-OFF production responses for all exact private routes', async () => {
    expect(await status(message)).toBe(503);
    expect(await status(ack, 'POST')).toBe(503);
    expect(await status(continuity)).toBe(503);
  });

  it('preserves original route method restrictions and never starts a release', async () => {
    expect(await status(message, 'POST')).toBe(405);
    expect(await status(ack, 'GET')).toBe(405);
    expect(await status(continuity, 'POST')).toBe(405);
    expect(await status(message + '&paidReadReleaseEnabled=true')).toBe(404);
    expect(await status(ack + '&productReleaseEnabled=true', 'POST')).toBe(404);
    expect(await status(continuity + '&productReleaseEnabled=true')).toBe(404);
  });

  it('rejects cross-route, ambiguous metadata and invalid identities without DB access', async () => {
    expect(await status('/api/me?__myeongha_held_reader_route=message')).toBe(404);
    expect(await status(message.replace(THREAD, 'not-a-uuid'))).toBe(404);
    expect(await status(ack + '&__myeongha_held_reader_message_id=' + MESSAGE, 'POST')).toBe(404);
    expect(await status(continuity.replace('baekheon', 'BAD*'))).toBe(404);
    expect(await status('/api/unrelated' + message.slice('/api/me'.length))).toBe(404);
    expect(await status('/api/me')).toBeNull();
  });

  it('accepts the original Vercel source pathname only when metadata matches', async () => {
    const msgPath = `/api/chat/${THREAD}/paid-readings/${MESSAGE}`;
    const ackPath = msgPath + '/ack';
    const readPath = `/api/readings/${READING}/reader-continuity`;
    expect(await status(msgPath + message.slice('/api/me'.length))).toBe(503);
    expect(await status(ackPath + ack.slice('/api/me'.length), 'POST')).toBe(503);
    expect(await status(readPath + continuity.slice('/api/me'.length))).toBe(503);
    expect(await status(ackPath + message.slice('/api/me'.length))).toBe(404);
  });
});
