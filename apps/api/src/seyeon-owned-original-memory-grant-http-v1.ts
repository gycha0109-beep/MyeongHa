// Watchtower-Track: security
// Staged explicit consent boundary: NEVER mounted in the primary Worker.
import { randomUUID } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  createSeyeonOwnedOriginalGrantV1,
  type SeyeonOwnedOriginalGrantReceiptV1,
} from './postgres-seyeon-owned-original-grant-v1.js';

export const SEYEON_OWNED_ORIGINAL_GRANT_HTTP_V1 = Object.freeze({
  method: 'POST',
  routeTemplate: '/api/memories/:memoryItemId/grants/seyeon',
  publicRouteMounted: false,
  defaultDbWriteAdmission: 'DENY',
  memberOnly: true,
  consent: 'character_only:seyeon',
} as const);

const PATH = /^\/api\/memories\/([^/]+)\/grants\/seyeon$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BYTES = 192;
const CONTRACT = 'v0.9';

export interface HandleSeyeonOwnedOriginalGrantRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  /** Server-composed only; no browser body, header or env switch may set it. */
  readonly approvedDbWriteAdmission?: () => boolean | Promise<boolean>;
  /** Only for isolated tests. Production invokes the original owner RPC. */
  readonly createGrant?: (input: Readonly<{
    pool: PostgresSubjectPoolV1;
    verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
    memoryItemId: string;
    grantId: string;
  }>) => Promise<SeyeonOwnedOriginalGrantReceiptV1>;
}

function fail(status: number, code: string, requestId: string): Response {
  return Response.json({
    ok: false, error: { code, retryable: false },
    meta: { apiContractVersion: CONTRACT, requestId },
  }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function exactChoice(request: Request): Promise<boolean> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? '') ||
      request.body === null) return false;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); }
  catch { return false; }
  const chunks: Uint8Array[] = [];
  let count = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_,reject) => {
    timeout = setTimeout(() => reject(Error('Consent body deadline')), 1500);
  });
  try {
    while (true) {
      if (request.signal.aborted) return false;
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      if (!part.value) return false;
      count += part.value.byteLength;
      if (count > MAX_BYTES) return false;
      chunks.push(part.value);
    }
    const merged = new Uint8Array(count);
    let index = 0;
    for (const bytes of chunks) { merged.set(bytes,index); index += bytes.byteLength; }
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8',{fatal:true}).decode(merged),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const body = value as Record<string,unknown>;
    if (Object.keys(body).length !== 1) return false;
    const choice = body.grantChoice;
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return false;
    const parsed = choice as Record<string,unknown>;
    return Object.keys(parsed).length === 2 &&
      parsed.mode === 'character_only' && parsed.characterId === 'seyeon';
  } catch { return false; }
  finally {
    if (timeout !== undefined) clearTimeout(timeout);
    try { void reader.cancel().catch(() => undefined); } catch { /* best effort */ }
    try { reader.releaseLock(); } catch { /* best effort */ }
  }
}

async function inMemberTransaction(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  memoryItemId: string;
  grantId: string;
}>) {
  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') throw Error('Current Member required');
      return createSeyeonOwnedOriginalGrantV1(client, {
        subjectId: resolvedSubject.subjectId,
        memoryItemId: input.memoryItemId,
        grantId: input.grantId,
        grantChoice: { mode: 'character_only', characterId: 'seyeon' },
      });
    },
  });
}

/**
 * This handler has NO Worker route. Correct verified Member consent is only
 * one gate: the DB Owner still requires an approved, current original source.
 */
export async function handleSeyeonOwnedOriginalGrantRequestV1(
  input: HandleSeyeonOwnedOriginalGrantRequestInputV1,
): Promise<Response> {
  if (typeof input.requestId !== 'string' || !input.requestId.trim() ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    throw Error('Server-owned grant request metadata is invalid');
  }
  const url = new URL(input.request.url);
  const id = url.search === '' && url.hash === '' ? PATH.exec(url.pathname)?.[1] : null;
  if (!id || !UUID.test(id)) return fail(404,'NOT_FOUND',input.requestId);
  if (input.request.method !== 'POST') {
    return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  }
  if (!(await exactChoice(input.request))) return fail(400,'INVALID_REQUEST',input.requestId);
  const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (!evidence) return fail(401,'AUTH_REQUIRED',input.requestId);
  if (evidence.kind !== 'member') return fail(403,'MEMBER_REQUIRED',input.requestId);

  let allowed = false;
  try {
    allowed = input.approvedDbWriteAdmission !== undefined &&
      await input.approvedDbWriteAdmission() === true;
  } catch { allowed = false; }
  if (!allowed || input.request.signal.aborted) {
    return fail(503,'SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE',input.requestId);
  }

  const grantId = randomUUID();
  try {
    const receipt = await (input.createGrant ?? inMemberTransaction)({
      pool:input.pool,verifiedEvidence:evidence,memoryItemId:id,grantId,
    });
    if (receipt.memoryItemId !== id || receipt.grantId !== grantId ||
        receipt.characterId !== 'seyeon' || receipt.replayed !== false) {
      return fail(503,'SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE',input.requestId);
    }
    return Response.json({
      ok:true,
      data:{memoryItemId:id,characterId:'seyeon',currentlyGranted:true,
        grantState:'active'},
      meta:{apiContractVersion:CONTRACT,requestId:input.requestId,
        serverTime:input.serverTime},
    },{status:200,headers:{'Cache-Control':'no-store'}});
  } catch {
    return fail(503,'SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE',input.requestId);
  }
}
