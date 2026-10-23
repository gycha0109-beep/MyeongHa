// Watchtower-Track: security
// Node-only S5/G3 pre-model deny tests; no DB access, provider or public mount.
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  assertSeyeonNodeFirstSendAdmissionV1,
  assertSeyeonNodeChatResponseMetadataV1,
} from '../apps/api/src/seyeon-node-original-grant-send-boundary-v1.js';
import {
  executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import type {
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH = 'd0000000-0000-4000-8000-000000000001';
const THREAD = 'd2000000-0000-4000-8000-000000000003';
const TURN = 'd3000000-0000-4000-8000-000000000004';
const ID = 'g3-valid-request';
const TIME = '2026-10-22T00:00:00.000Z';

describe('S5/G3 Node protected first-send metadata before model or original Grant', () => {
  it.each([
    ['spaces in request ID', {requestId: 'has spaces'}],
    ['empty request ID', {requestId: ''}],
    ['invalid request timestamp', {serverTime: '2026-10-22'}],
    ['normalized leap date', {serverTime: '2026-02-30T00:00:00.000Z'}],
    ['short deadline', {deadlineMs: 99}],
    ['oversized deadline', {deadlineMs: 10_001}],
    ['fractional deadline', {deadlineMs: 150.5}],
    ['nonfinite deadline', {deadlineMs: Number.POSITIVE_INFINITY}],
  ] as const)('holds %s and destroys socket with zero DB and provider calls', async (_name, mismatch) => {
    let destroyed = false;
    let dbConnections = 0;
    let runtimeCalls = 0;
    const pool: PostgresSubjectPoolV1 = {
      connect(): never {
        dbConnections++;
        throw Error('DB must not be consulted after invalid send admission');
      },
    };
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      socket: {},
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;

    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: {kind: 'member', verifiedAuthUserId: AUTH},
      threadId: THREAD,
      clientTurnId: TURN,
      text: '안녕하세요',
      requestId: ID,
      serverTime: TIME,
      deadlineMs: 1000,
      runtime: {
        async run(): Promise<never> {
          runtimeCalls++;
          throw Error('Provider must not be called after invalid send admission');
        },
      },
      ...mismatch,
    })).rejects.toMatchObject({code: 'INVALID_SCOPE'});
    expect(destroyed).toBe(true);
    expect(dbConnections).toBe(0);
    expect(runtimeCalls).toBe(0);
  });

  it('reuses identical server request checks in preflight and final response metadata', () => {
    expect(() => assertSeyeonNodeFirstSendAdmissionV1({
      requestId: ID,
      serverTime: TIME,
      deadlineMs: 1000,
    })).not.toThrow();
    expect(() => assertSeyeonNodeChatResponseMetadataV1({
      turnId: TURN,
      assistantMessageId: 'd4000000-0000-4000-8000-000000000005',
      sequenceNo: 1,
      replayed: false,
      requestId: ID,
      serverTime: TIME,
    })).not.toThrow();
    // Zero-source direct Node delivery has a separate existing receipt
    // contract: sequence 0 is valid there. Only private positive G3
    // (deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1) requires >= 1.
    expect(() => assertSeyeonNodeChatResponseMetadataV1({
      turnId: TURN,
      assistantMessageId: 'd4000000-0000-4000-8000-000000000005',
      sequenceNo: 0,
      replayed: false,
      requestId: ID,
      serverTime: TIME,
    })).not.toThrow();
    for (const bad of [
      {requestId: 'with spaces', serverTime: TIME},
      {requestId: ID, serverTime: '2026-02-30T00:00:00.000Z'},
    ]) {
      expect(() => assertSeyeonNodeFirstSendAdmissionV1(bad)).toThrow();
      expect(() => assertSeyeonNodeChatResponseMetadataV1({
        turnId: TURN,
        assistantMessageId: 'd4000000-0000-4000-8000-000000000005',
        sequenceNo: 1,
        replayed: false,
        ...bad,
      })).toThrow();
    }
  });
});
