// Watchtower-Track: security
// S2/G0: read-only owner-scoped status for Se-yeon's CURRENT Memory access.
// This route does not create, renew or revoke grants and never reads Memory text.
import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
} from './postgres-reader-context-memory.js';
import { getMemoryGrants } from './memory-grants-read.js';

export const SEYEON_MEMBER_MEMORY_GRANT_STATUS_HTTP_V1 = Object.freeze({
  method: 'GET',
  publicRoute: '/api/memories/:memoryItemId/grants/seyeon',
  dbAuthority: 'public.qry_memory_active_grants_v1',
  lifecycleAuthority: 'public.qry_seyeon_memory_grant_lifecycle_v1',
  databaseWrites: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CANONICAL = /^\/api\/memories\/([^/]+)\/grants\/seyeon$/u;
const INTERNAL_PATH = '/api/memory-grants';
const INTERNAL_PARAM = '__myeongha_seyeon_memory_grant_status_id';

export interface HandleSeyeonMemberMemoryGrantStatusRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json({
    ok: false,
    error: { code, retryable: false },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function memoryIdFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  if (url.hash !== '') return null;
  const matched = CANONICAL.exec(url.pathname);
  const markers = url.searchParams.getAll(INTERNAL_PARAM);
  const allowedQuery = [...url.searchParams.keys()]
    .every(key => key === INTERNAL_PARAM || key === '_vercel_share');
  if (!allowedQuery || markers.length > 1) return null;
  if (matched !== null) {
    const value = matched[1];
    if (value === undefined || !UUID.test(value)) return null;
    return markers.length === 0 || markers[0] === value ? value : null;
  }
  if (url.pathname !== INTERNAL_PATH || markers.length !== 1) return null;
  const value = markers[0];
  return value !== undefined && UUID.test(value) ? value : null;
}

/**
 * Returns the *current* active Se-yeon authorization for one owned Memory.
 * The PostgreSQL authority validates Subject/Memory ownership; a zero-row
 * grant list means no current access, NOT that an arbitrary Memory is owned.
 * No active grant is ever inferred from old dialogue or a client claim.
 */
export async function handleSeyeonMemberMemoryGrantStatusRequestV1(
  input: HandleSeyeonMemberMemoryGrantStatusRequestInputV1,
): Promise<Response> {
  if (typeof input.requestId !== 'string' || input.requestId.trim() === '' ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    throw new Error('Invalid server-owned grant status request metadata.');
  }
  const memoryItemId = memoryIdFromRequest(input.request);
  if (memoryItemId === null) {
    return errorResponse(404, 'NOT_FOUND', input.requestId);
  }
  if (input.request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
    });
  }

  const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (evidence === null) return errorResponse(401, 'AUTH_REQUIRED', input.requestId);
  if (evidence.kind !== 'member') {
    return errorResponse(403, 'MEMBER_REQUIRED', input.requestId);
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: evidence,
      execute: async ({ resolvedSubject, client }) => {
        if (resolvedSubject.subjectKind !== 'member') {
          throw new ApiCommandError('NOT_FOUND', 'Member grant status unavailable.');
        }
        // Source RLS deliberately hides pending withdrawal rows. The ordinary
        // owner-scoped grant projection remains the current-use authority.
        const grants = await getMemoryGrants({
          resolvedSubjectId: resolvedSubject.subjectId,
          memoryItemId,
          authorityPort: createPostgresReaderContextMemoryGrantsAuthorityPortV1(client),
        });
        const seyeon = grants.grants.filter(grant => grant.characterId === 'seyeon');
        if (seyeon.length > 1) throw new Error('Ambiguous current grant');
        const active = seyeon[0];
        const available = await client.query<{ installed: boolean }>(
          `select to_regprocedure(
            'public.qry_seyeon_memory_grant_lifecycle_v1(uuid,uuid)'
          ) is not null as "installed"`,
        );
        if (available.rows.length !== 1 ||
            typeof available.rows[0]?.installed !== 'boolean') {
          throw new Error('Lifecycle authority installation unknown');
        }
        if (!available.rows[0].installed) {
          // Before the read-only SQL is installed, "no active grant" could
          // mean pending withdrawal OR fully revoked. Never infer completion.
          return {
            grantState: active === undefined ? 'unknown' : 'active',
            grantedAt: active?.grantedAt ?? null,
          } as const;
        }
        const lifecycle = await client.query<{ grantState: string; grantedAt: string | null }>(
          `select grant_state as "grantState",
                  granted_at::text as "grantedAt"
             from public.qry_seyeon_memory_grant_lifecycle_v1($1::uuid,$2::uuid)`,
          [resolvedSubject.subjectId, memoryItemId],
        );
        if (lifecycle.rows.length !== 1) throw new Error('Lifecycle result missing');
        const row = lifecycle.rows[0]!;
        if (row.grantState !== 'active' &&
            row.grantState !== 'withdrawal_pending' &&
            row.grantState !== 'not_granted') throw new Error('Invalid lifecycle state');
        if ((row.grantState === 'active') !== (active !== undefined) ||
            (row.grantState === 'active' && row.grantedAt !== active?.grantedAt) ||
            (row.grantState !== 'active' && row.grantedAt !== null)) {
          throw new Error('Grant authority and lifecycle disagree');
        }
        return { grantState: row.grantState, grantedAt: row.grantedAt } as const;
      },
    });
    return Response.json({
      ok: true,
      data: {
        memoryItemId,
        characterId: 'seyeon',
        currentlyGranted: data.grantState === 'active',
        grantedAt: data.grantedAt,
        grantState: data.grantState,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: input.requestId,
        serverTime: input.serverTime,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ApiCommandError) {
      if (error.code === 'NOT_FOUND') return errorResponse(404, 'NOT_FOUND', input.requestId);
      if (error.code === 'INVALID_REQUEST') {
        return errorResponse(400, 'INVALID_REQUEST', input.requestId);
      }
    }
    return errorResponse(503, 'GRANT_STATUS_UNAVAILABLE', input.requestId);
  }
}
