// Watchtower-Track: security
// POST /api/memory/proposals/:id/accept application boundary, UNMOUNTED.
// Admission is SERVER OWNED and absent by default: no DB or Memory writes.
import { randomUUID } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  acceptSeyeonPrivateConversationRecallProposalV1,
  type SeyeonPrivateMemoryProposalAcceptedV1,
} from './postgres-seyeon-private-memory-proposal-accept-v1.js';

export const SEYEON_PRIVATE_MEMORY_ACCEPT_HTTP_V1 = Object.freeze({
  method: 'POST',
  routeTemplate: '/api/memory/proposals/:id/accept',
  memberOnly: true,
  acceptedGrantChoice: 'private',
  publicRouteMounted: false,
  defaultDbWriteAdmission: 'DENY',
} as const);

const ROUTE = /^\/api\/memory\/proposals\/([^/]+)\/accept$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY_BYTES = 256;
const API_CONTRACT = 'v0.9' as const;

export interface HandleSeyeonPrivateMemoryProposalAcceptInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  /** Never derived from body, header, env or model. No production caller
   * sets this while SRC-25, DB EXECUTE/ACL, DR and release are unavailable.
   */
  readonly approvedDbWriteAdmission?: () => boolean | Promise<boolean>;
  /** Server-only acceptance command injection, not exposed over HTTP. */
  readonly accept?: (input: Readonly<{
    pool: PostgresSubjectPoolV1;
    verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
    proposalId: string;
    memoryItemId: string;
  }>) => Promise<SeyeonPrivateMemoryProposalAcceptedV1>;
}

function noStore(status: number, requestId: string, code: string): Response {
  return Response.json({
    ok: false,
    error: { code, retryable: false },
    meta: { apiContractVersion: API_CONTRACT, requestId },
  }, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
}
function unavailable(requestId: string): Response {
  return noStore(503, requestId, 'SEYEON_PRIVATE_MEMORY_ACCEPT_AUTHORITY_UNAVAILABLE');
}

async function readExactPrivateBody(request: Request): Promise<boolean> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? '')) return false;
  if (request.body === null) return false;
  // An already consumed or locked stream is invalid input, not an uncaught
  // Worker error. No identity verifier or DB admission may run on this path.
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return false;
  }
  const bytes: Uint8Array[] = [];
  let total = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(Error('Private proposal body read deadline')), 1500);
  });
  try {
    while (true) {
      if (request.signal.aborted) return false;
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      if (!next.value) return false;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) return false;
      bytes.push(next.value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of bytes) {
      joined.set(part, offset);
      offset += part.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const top = parsed as Record<string, unknown>;
    if (Object.keys(top).length !== 1 || !Object.hasOwn(top, 'grantChoice')) return false;
    const choice = top.grantChoice;
    if (choice === null || typeof choice !== 'object' || Array.isArray(choice)) return false;
    const selection = choice as Record<string, unknown>;
    return Object.keys(selection).length === 1 && selection.mode === 'private';
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    // A failed cancellation/release must not turn safe rejection into 500.
    try { void reader.cancel().catch(() => undefined); } catch { /* best effort */ }
    try { reader.releaseLock(); } catch { /* best effort */ }
  }
}

async function acceptInVerifiedSubjectTransaction(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  proposalId: string;
  memoryItemId: string;
}>): Promise<SeyeonPrivateMemoryProposalAcceptedV1> {
  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') throw Error('Member Subject required');
      return acceptSeyeonPrivateConversationRecallProposalV1(client, {
        subjectId: resolvedSubject.subjectId,
        proposalId: input.proposalId,
        memoryItemId: input.memoryItemId,
        grantChoice: { mode: 'private' },
      });
    },
  });
}

/**
 * The sole HTTP contribution is the verified Member approval choice.
 * Proposal content, type, Grant and Subject come from the ORIGINAL DB rows,
 * never from arbitrary JSON/model/client claims. Positive rollout is OFF.
 */
export async function handleSeyeonPrivateMemoryProposalAcceptRequestV1(
  input: HandleSeyeonPrivateMemoryProposalAcceptInputV1,
): Promise<Response> {
  const { request, requestId } = input;
  if (typeof requestId !== 'string' || requestId.trim().length === 0 ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    throw new Error('Invalid server-owned private Memory request metadata');
  }
  const url = new URL(request.url);
  const match = url.search === '' && url.hash === '' ? ROUTE.exec(url.pathname) : null;
  const proposalId = match?.[1];
  if (!proposalId || !UUID.test(proposalId)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: {
      Allow: 'POST', 'Cache-Control': 'no-store',
    } });
  }
  if (!(await readExactPrivateBody(request))) {
    return noStore(400, requestId, 'INVALID_REQUEST');
  }
  const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(request);
  if (evidence === null) return noStore(401, requestId, 'AUTH_REQUIRED');
  if (evidence.kind !== 'member') return noStore(403, requestId, 'MEMBER_REQUIRED');

  let approved = false;
  try {
    approved = input.approvedDbWriteAdmission !== undefined &&
      (await input.approvedDbWriteAdmission()) === true;
  } catch {
    approved = false;
  }
  if (!approved || request.signal.aborted) return unavailable(requestId);

  const memoryItemId = randomUUID();
  try {
    const data = await (input.accept ?? acceptInVerifiedSubjectTransaction)({
      pool: input.pool,
      verifiedEvidence: evidence,
      proposalId,
      memoryItemId,
    });
    if (data.memoryItemId !== memoryItemId || data.grantCount !== 0 ||
        data.replayed !== false) return unavailable(requestId);
    return Response.json({
      ok: true,
      data,
      meta: { apiContractVersion: API_CONTRACT, requestId, serverTime: input.serverTime },
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // DB ACL deny, missing RPC, stale proposal, lock conflict and ambiguous
    // transaction outcome must never become a fabricated successful approval.
    return unavailable(requestId);
  }
}
