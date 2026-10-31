// Watchtower-Track: security
// Offline/Node-owned transport candidate only. Production uses Vercel Fetch
// Response and MUST retain the unconditional first-Reveal HOLD. R10's real
// PostgreSQL case proves the necessary lock order, not a Vercel proxy handoff.
import type { ServerResponse } from 'node:http';

export const SEYEON_NODE_ORIGINAL_GRANT_SEND_BOUNDARY_V1 = Object.freeze({
  version: 'seyeon-node-original-grant-send-boundary-v1',
  transport: 'node:http.ServerResponse',
  initialPersonalStreaming: false,
  defaultDeadlineMs: 5_000,
  maxDeadlineMs: 10_000,
  maxAssistantUtf8Bytes: 65_536,
  productionVercelFetchSupported: false,
} as const);

export type SeyeonNodeOriginalGrantSendOutcomeV1 = 'assistant_sent' | 'reveal_held';

/** Server-produced receipt metadata only. There is deliberately no text field. */
export interface SeyeonNodeChatResponseMetadataV1 {
  readonly turnId: string;
  readonly assistantMessageId: string;
  readonly sequenceNo: number;
  readonly replayed: boolean;
  readonly requestId: string;
  readonly serverTime: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const API_CONTRACT_VERSION = 'v0.9' as const;

function isCanonicalSeyeonNodeRequestMetadataV1(value: Readonly<{
  requestId: unknown;
  serverTime: unknown;
}>): boolean {
  return typeof value.requestId === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/u.test(value.requestId) &&
    typeof value.serverTime === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.serverTime) &&
    Number.isFinite(Date.parse(value.serverTime)) &&
    new Date(value.serverTime).toISOString() === value.serverTime;
}

export function assertSeyeonNodeChatResponseMetadataV1(
  value: SeyeonNodeChatResponseMetadataV1,
): void {
  if (!value || typeof value !== 'object' ||
      typeof value.turnId !== 'string' || !UUID.test(value.turnId) ||
      typeof value.assistantMessageId !== 'string' ||
      !UUID.test(value.assistantMessageId) ||
      !Number.isSafeInteger(value.sequenceNo) || value.sequenceNo < 0 ||
      typeof value.replayed !== 'boolean' ||
      !isCanonicalSeyeonNodeRequestMetadataV1(value)) {
    throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
      'Node Chat response metadata must be canonical server-owned identifiers.',
    );
  }
}

export class SeyeonNodeOriginalGrantSendBoundaryErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonNodeOriginalGrantSendBoundaryErrorV1';
  }
}

/**
 * DB authority port. It MUST open one real transaction, lock the original
 * Subject/Grant/Record and immutable Attempt provenance, check CURRENT rights
 * via the DB owner, and call deliver() BEFORE COMMIT/ROLLBACK releases locks.
 *
 * When signal aborts, cancel the query and roll back. Failure to release a DB
 * connection on disconnect/deadline is a port contract violation.
 *
 * The port MUST NEVER accept an old check, client-supplied Grant, replay text,
 * or regrant as authorization. NULL means fail-closed, not a cached success.
 */
export type SeyeonOriginalGrantLockedReadV1 = (input: Readonly<{
  signal: AbortSignal;
  deliver: (authorizedAssistantText: string | null) => Promise<void>;
}>) => Promise<void>;

export interface SendSeyeonNodeOriginalGrantResponseInputV1 {
  /** A trusted Node HTTP socket owned by THIS process, not a Fetch Response. */
  readonly response: ServerResponse;
  /** Node request abort / client disconnect signal, server-provided only. */
  readonly requestSignal: AbortSignal;
  /** Must retain the DB original-Grant read transaction across deliver(). */
  readonly withLockedOriginalGrant: SeyeonOriginalGrantLockedReadV1;
  /** Bounds the period this request may retain locks or attempt a send. */
  readonly deadlineMs?: number;
  /** Exact existing Chat API envelope, assembled only from server receipt. */
  readonly chatResponseMetadata?: SeyeonNodeChatResponseMetadataV1;
}

const HELD_BYTES = Buffer.from(JSON.stringify({
  ok: false,
  error: { code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE', retryable: false },
}), 'utf8');

function deadlineValue(input: number | undefined): number {
  const chosen = input ?? SEYEON_NODE_ORIGINAL_GRANT_SEND_BOUNDARY_V1.defaultDeadlineMs;
  if (!Number.isSafeInteger(chosen) || chosen < 100 ||
      chosen > SEYEON_NODE_ORIGINAL_GRANT_SEND_BOUNDARY_V1.maxDeadlineMs) {
    throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1('Invalid bounded send deadline.');
  }
  return chosen;
}

/**
 * Reject malformed server-owned request metadata and invalid send bounds
 * BEFORE runtime.run() can dispatch an AI/provider request. The final
 * receipt still undergoes the independent full metadata/Grant validation.
 * This is an offline negative admission, never a publication permission.
 */
export function assertSeyeonNodeFirstSendAdmissionV1(input: Readonly<{
  requestId: string;
  serverTime: string;
  deadlineMs?: number;
}>): void {
  if (!input || typeof input !== 'object' ||
      !isCanonicalSeyeonNodeRequestMetadataV1(input)) {
    throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
      'Node Chat request metadata must be canonical server-owned identifiers.',
    );
  }
  deadlineValue(input.deadlineMs);
}

function responseBytes(
  value: string | null,
  chatResponseMetadata?: SeyeonNodeChatResponseMetadataV1,
): Readonly<{
  status: number;
  bytes: Buffer;
  outcome: SeyeonNodeOriginalGrantSendOutcomeV1;
}> {
  if (chatResponseMetadata !== undefined) {
    assertSeyeonNodeChatResponseMetadataV1(chatResponseMetadata);
  }
  if (value === null) {
    return {
      status: 503,
      bytes: chatResponseMetadata === undefined ? HELD_BYTES : Buffer.from(JSON.stringify({
        ok: false,
        error: {
          code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
          messageKey: 'chat.secure_reveal_unavailable',
          retryable: false,
        },
        meta: { apiContractVersion: API_CONTRACT_VERSION, requestId: chatResponseMetadata.requestId },
      }), 'utf8'),
      outcome: 'reveal_held',
    };
  }
  if (typeof value !== 'string' || value.trim().length === 0 ||
      Buffer.byteLength(value, 'utf8') >
      SEYEON_NODE_ORIGINAL_GRANT_SEND_BOUNDARY_V1.maxAssistantUtf8Bytes) {
    throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1('Invalid authorized assistant payload.');
  }
  return {
    status: 200,
    bytes: Buffer.from(JSON.stringify(chatResponseMetadata === undefined
      ? { ok: true, assistantText: value }
      : {
          ok: true,
          data: {
            turnId: chatResponseMetadata.turnId,
            assistantMessageId: chatResponseMetadata.assistantMessageId,
            assistantText: value,
            sequenceNo: chatResponseMetadata.sequenceNo,
            replayed: chatResponseMetadata.replayed,
          },
          meta: {
            apiContractVersion: API_CONTRACT_VERSION,
            requestId: chatResponseMetadata.requestId,
            serverTime: chatResponseMetadata.serverTime,
          },
        }), 'utf8'),
    outcome: 'assistant_sent',
  };
}

/**
 * Node-only bounded handoff implementation. The SQL authority holds SHARE
 * locks until Node's 'finish' (OS send-buffer handoff); an independent revoke
 * FOR UPDATE therefore cannot COMMIT while the Node send is in progress.
 *
 * 'finish' IS NOT proof that a Vercel proxy or client has received the bytes.
 * This code cannot be wired to api/me.ts's Fetch Response: that would silently
 * break the S/R ordering. No Production route calls this candidate.
 *
 * On cancellation, destroy the socket, require DB rollback and NEVER release
 * an old buffered assistant payload. No streaming/partial private output.
 */
export async function sendSeyeonNodeOriginalGrantResponseV1(
  input: SendSeyeonNodeOriginalGrantResponseInputV1,
): Promise<SeyeonNodeOriginalGrantSendOutcomeV1> {
  // A rejected deadline/receipt or an already-started response cannot
  // leave a writable protected socket for an outer fallback writer.
  // No DB authority callback runs until this ingress boundary is complete.
  let deadlineMs: number;
  try {
    deadlineMs = deadlineValue(input.deadlineMs);
    if (input.chatResponseMetadata !== undefined) {
      assertSeyeonNodeChatResponseMetadataV1(input.chatResponseMetadata);
      // The low-level socket boundary must not trust an upstream replay
      // admission. Replayed receipts never authorize a first private send.
      if (input.chatResponseMetadata.replayed) {
        throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
          'Replayed Seyeon turns cannot use the original first-send socket.',
        );
      }
    }
    if (input.response.headersSent || input.response.writableEnded ||
        input.response.destroyed) {
      throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
        'Node response already started; cannot authorize a protected send.',
      );
    }
  } catch (error) {
    if (!input.response.destroyed) input.response.destroy();
    throw error;
  }
  if (input.requestSignal.aborted) {
    input.response.destroy();
    throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1('Request already aborted.');
  }

  const controller = new AbortController();
  let outcome: SeyeonNodeOriginalGrantSendOutcomeV1 | null = null;
  let attempted = false;
  let handoffCompleted = false;

  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
    // Destroy, do not wait for a slow recipient or a buffered stale response.
    if (!input.response.destroyed) input.response.destroy();
  };
  const onEarlyClose = () => { if (!handoffCompleted) abort(); };
  const onRequestAbort = () => abort();
  input.response.on('close', onEarlyClose);
  input.requestSignal.addEventListener('abort', onRequestAbort, { once: true });
  const deadline = setTimeout(abort, deadlineMs);

  const deliver = async (value: string | null): Promise<void> => {
    // DB authority may invoke deliver only while the exact original Grant and
    // Attempt locks are still held. Only one send per transaction is allowed.
    if (attempted || controller.signal.aborted || input.response.headersSent ||
        input.response.writableEnded || input.response.destroyed) {
      throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
        'Protected send lost its single-use live transaction boundary.',
      );
    }
    attempted = true;
    const payload = responseBytes(value, input.chatResponseMetadata);
    const finished = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        input.response.off('finish', onFinish);
        input.response.off('close', onClose);
        input.response.off('error', onError);
        controller.signal.removeEventListener('abort', onAbort);
      };
      const onFinish = () => {
        handoffCompleted = true;
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
          'Client disconnected before HTTP send handoff.',
        ));
      };
      const onError = () => {
        cleanup();
        reject(new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
          'Node HTTP socket errored during protected send.',
        ));
      };
      const onAbort = () => {
        cleanup();
        reject(new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
          'Protected send aborted before HTTP handoff.',
        ));
      };
      input.response.once('finish', onFinish);
      input.response.once('close', onClose);
      input.response.once('error', onError);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    // Header setters and ServerResponse.end() may throw synchronously. The
    // outer catch aborts the transaction, which rejects this pending promise;
    // attach a handler now so that rejection cannot escape unobserved when
    // the synchronous writer exception bypasses the later await.
    void finished.catch(() => undefined);
    // Explicit one-shot, non-streaming body; these headers are server-owned.
    input.response.statusCode = payload.status;
    input.response.setHeader('Cache-Control', 'no-store');
    input.response.setHeader('Content-Type', 'application/json; charset=utf-8');
    input.response.setHeader('Content-Length', String(payload.bytes.length));
    input.response.end(payload.bytes);
    await finished;
    if (controller.signal.aborted) {
      throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
        'Protected send was revoked while finishing.',
      );
    }
    outcome = payload.outcome;
  };

  try {
    await input.withLockedOriginalGrant({
      signal: controller.signal,
      deliver,
    });
    if (controller.signal.aborted || !attempted || !handoffCompleted ||
        outcome === null) {
      throw new SeyeonNodeOriginalGrantSendBoundaryErrorV1(
        'Original Grant lock did not complete a valid Node socket handoff.',
      );
    }
    return outcome;
  } catch (error) {
    // If the transaction fails or times out, abort instead of returning any
    // user-controllable payload; DB transaction owner must roll back.
    abort();
    throw error;
  } finally {
    clearTimeout(deadline);
    input.requestSignal.removeEventListener('abort', onRequestAbort);
    input.response.off('close', onEarlyClose);
  }
}
