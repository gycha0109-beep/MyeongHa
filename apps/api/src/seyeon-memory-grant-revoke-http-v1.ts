// Watchtower-Track: security
// R16: completed HTTP application boundary, NOT a deployed revoke route.
// The actual live myeongha_api_executor role cannot execute the current
// SECURITY INVOKER revoke RPC or update its tables. No broad ACL grants here.
import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  revokeSeyeonOriginalMemoryGrantAndAckV1,
  SeyeonOriginalGrantRevokeAckErrorV1,
  type RevokeSeyeonOriginalMemoryGrantAndAckInputV1,
  type SeyeonOriginalMemoryGrantRevokeAckV1,
} from './seyeon-original-grant-revoke-ack-v1.js';

export const SEYEON_MEMORY_GRANT_REVOKE_HTTP_V1 = Object.freeze({
  method: 'POST',
  routeTemplate: '/api/memories/:memoryItemId/grants/seyeon/revoke',
  requiresVerifiedMember: true,
  requestBodyAllowed: false,
  defaultDbWriteAdmission: 'DENY',
  productionRouteMounted: false,
  currentProductionExecutionRoleAclApproved: false,
} as const);

const ROUTE = /^\/api\/memories\/([^/]+)\/grants\/seyeon\/revoke$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CACHE_CONTROL = 'no-store' as const;
const API_CONTRACT = 'v0.9' as const;

export interface HandleSeyeonMemoryGrantRevokeRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  /**
   * SERVER-OWNED positive admission after Security/DB execution-role ACL
   * approval. Absent, false or failing admission MUST NOT reach the DB.
   * It is NOT read from request headers/body/env or the user's consent flag.
   */
  readonly approvedDbWriteAdmission?: () => boolean | Promise<boolean>;
  /** Server-owned test adapter; never accept from an HTTP request. */
  readonly revoke?: (
    input: RevokeSeyeonOriginalMemoryGrantAndAckInputV1,
  ) => Promise<SeyeonOriginalMemoryGrantRevokeAckV1 | Readonly<{
    status:'pending'; memoryItemId:string; characterId:'seyeon'; newUseBlocked:true;
  }>>;
}

function problem(input: {
  status: number;
  code: string;
  messageKey: string;
  requestId: string;
}): Response {
  return Response.json({
    ok: false,
    error: {
      code: input.code,
      messageKey: input.messageKey,
      retryable: false,
    },
    meta: { apiContractVersion: API_CONTRACT, requestId: input.requestId },
  }, {
    status: input.status,
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}

function unavailable(requestId: string): Response {
  return problem({
    status: 503,
    code: 'SEYEON_MEMORY_GRANT_REVOKE_AUTHORITY_UNAVAILABLE',
    messageKey: 'memory.grant_revoke_unavailable',
    requestId,
  });
}

function ownedMemoryId(request: Request): string | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') return null;
  const match = ROUTE.exec(url.pathname);
  if (match === null) return null;
  const memoryId = match[1];
  return memoryId !== undefined && UUID.test(memoryId) ? memoryId : null;
}

/**
 * Cloudflare may expose a ReadableStream for an HTTP POST with zero body
 * bytes. Only actual nonempty content is forbidden; never trust a header
 * or read a user-supplied payload into memory to decide authorization.
 */
async function hasBodyBytesOrReadFailure(request: Request): Promise<boolean> {
  if (request.body === null) return false;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); }
  catch { return true; }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Empty-body read deadline')), 1000);
  });
  try {
    for (;;) {
      if (request.signal.aborted) return true;
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) return false;
      if (chunk.value.byteLength > 0) return true;
    }
  } catch {
    return true;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { void reader.cancel().catch(() => undefined); } catch {}
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * POST /api/memories/:memoryItemId/grants/seyeon/revoke
 *
 * No JSON body: caller cannot forge Subject/Character/Grant/Attempt. Auth
 * verifier creates current Member evidence; canonical Subject is resolved
 * inside the R15 PostgreSQL transaction. The R15 success response is created
 * only after the revocation COMMIT resolves.
 *
 * Fail CLOSED before DB connection while the live SECURITY INVOKER execution
 * privilege is absent. Production /api/me.ts deliberately does not route here.
 */
export async function handleSeyeonMemoryGrantRevokeRequestV1(
  input: HandleSeyeonMemoryGrantRevokeRequestInputV1,
): Promise<Response> {
  const requestId = input.requestId;
  if (typeof requestId !== 'string' || requestId.trim() === '' ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    throw new Error('Invalid server-owned Se-yeon revoke HTTP metadata.');
  }

  const memoryItemId = ownedMemoryId(input.request);
  if (memoryItemId === null) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  }
  if (input.request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': CACHE_CONTROL },
    });
  }

  // Reject bytes, not a Worker-synthesized zero-byte POST stream.
  // No browser-specified Subject, Character or Grant may reach the authority.
  if (await hasBodyBytesOrReadFailure(input.request)) {
    return problem({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      requestId,
    });
  }

  const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(
    input.request,
  );
  if (evidence === null) {
    return problem({
      status: 401,
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      requestId,
    });
  }
  if (evidence.kind !== 'member') {
    return problem({
      status: 403,
      code: 'MEMBER_REQUIRED',
      messageKey: 'auth.member_required',
      requestId,
    });
  }

  // This explicit gate is necessary even if a future /api/me refactor
  // accidentally routes requests here before DB/Security owners sign.
  let admitted = false;
  try {
    admitted = input.approvedDbWriteAdmission === undefined
      ? false : (await input.approvedDbWriteAdmission()) === true;
  } catch {
    admitted = false;
  }
  if (!admitted || input.request.signal.aborted) return unavailable(requestId);

  try {
    const data = await (input.revoke ?? revokeSeyeonOriginalMemoryGrantAndAckV1)({
      pool: input.pool,
      verifiedEvidence: evidence,
      memoryItemId,
    });
    if (data.status === 'pending') {
      if (data.memoryItemId !== memoryItemId || data.characterId !== 'seyeon' ||
          data.newUseBlocked !== true) return unavailable(requestId);
      return Response.json({ok:true,data,
        meta:{apiContractVersion:API_CONTRACT,requestId,serverTime:input.serverTime}},
      {status:202,headers:{'Cache-Control':CACHE_CONTROL}});
    }
    // Do not report success for any uncommitted, malformed or forged port
    // response. R15 itself returns this only after DB COMMIT.
    if (data.status !== 'committed' ||
        data.memoryItemId !== memoryItemId ||
        data.characterId !== 'seyeon' ||
        !Number.isSafeInteger(data.revokedGrantCount) ||
        data.revokedGrantCount < 0 ||
        data.replayed !== (data.revokedGrantCount === 0)) {
      return unavailable(requestId);
    }

    return Response.json({
      ok: true,
      data,
      meta: { apiContractVersion: API_CONTRACT, requestId, serverTime: input.serverTime },
    }, {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (error) {
    if (error instanceof ApiCommandError && error.code === 'NOT_FOUND') {
      return problem({
        status: 404,
        code: 'NOT_FOUND',
        messageKey: 'memory.unavailable',
        requestId,
      });
    }
    if (error instanceof SeyeonOriginalGrantRevokeAckErrorV1 &&
        error.code === 'INVALID_MEMORY_ID') {
      return problem({
        status: 400,
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        requestId,
      });
    }
    // SQL privilege denial, row-lock timeout, ambiguous COMMIT, unexpected
    // adapters and DB outages all become no-store 503, NEVER a false ACK.
    return unavailable(requestId);
  }
}
