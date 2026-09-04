import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { executePostgresSubjectTransactionV1 } from './postgres-subject-execution.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

const API_CONTRACT_VERSION = 'v0.9' as const;
const GUEST_HEADER = 'x-myeongha-guest-bearer' as const;
const READ_GUEST_SESSION_SQL = `
select guest_session_id::text as "guestSessionId"
from public.qry_guest_bootstrap_current_v1($1::uuid)
`.trim();
const PROMOTE_SQL = `
select
  subject_id::text as "subjectId",
  subject_kind as "subjectKind",
  subject_status as "subjectStatus",
  replayed
from public.cmd_promote_guest_runtime_v1($1::uuid, $2::uuid, $3::uuid)
`.trim();

type PromotionRowV1 = Readonly<{
  subjectId: unknown;
  subjectKind: unknown;
  subjectStatus: unknown;
  replayed: unknown;
}>;

type GuestSessionRowV1 = Readonly<{ guestSessionId: unknown }>;

type PromotionRequestInputV1 = Readonly<{
  request: Request;
  requestId: string;
  serverTime: string;
}>;

function envelope(data: unknown, requestId: string, serverTime: string): Response {
  return Response.json(
    {
      ok: true,
      data,
      meta: { apiContractVersion: API_CONTRACT_VERSION, requestId, serverTime },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

function failure(code: string, status: number, requestId: string): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        messageKey: `auth.${code.toLowerCase()}`,
        retryable: status >= 500,
      },
      meta: { apiContractVersion: API_CONTRACT_VERSION, requestId },
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function requireUuidText(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new Error(`Guest promotion ${name} is invalid.`);
  }
  return value;
}

async function readEmptyBody(request: Request): Promise<boolean> {
  const text = await request.text();
  if (text.trim().length === 0) return true;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value as Record<string, unknown>).length === 0;
  } catch {
    return false;
  }
}

export interface ProductionGuestPromotionRuntimeV1 {
  handleRequest(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly serverTime: string;
  }): Promise<Response>;
  close(): Promise<void>;
}

export function createProductionGuestPromotionRuntimeV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
}): ProductionGuestPromotionRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const verifier = createProductionRequestIdentityVerifierV1({ config });

  return Object.freeze({
    async handleRequest(requestInput: PromotionRequestInputV1): Promise<Response> {
      const { request, requestId, serverTime } = requestInput;
      if (request.method !== 'POST') {
        return new Response(null, {
          status: 405,
          headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
        });
      }
      if (!(await readEmptyBody(request))) return failure('INVALID_REQUEST', 400, requestId);

      const guestBearer = request.headers.get(GUEST_HEADER);
      if (!guestBearer || guestBearer.length > 4096 || /\s/u.test(guestBearer)) {
        return failure('AUTH_REQUIRED', 401, requestId);
      }

      const memberEvidence = await verifier.verifyRequestIdentity(request);
      if (memberEvidence === null || memberEvidence.kind !== 'member') {
        return failure('AUTH_REQUIRED', 401, requestId);
      }

      const guestRequest = new Request(request.url, {
        headers: { Authorization: `Bearer ${guestBearer}` },
      });
      const guestEvidence = await verifier.verifyRequestIdentity(guestRequest);
      if (guestEvidence === null || guestEvidence.kind !== 'guest') {
        return failure('AUTH_REQUIRED', 401, requestId);
      }

      try {
        const result = await executePostgresSubjectTransactionV1({
          pool,
          verifiedEvidence: guestEvidence,
          async execute({ resolvedSubject, client }) {
            const sessionResult = await client.query<GuestSessionRowV1>(
              READ_GUEST_SESSION_SQL,
              [resolvedSubject.subjectId],
            );
            const sessionRow = sessionResult.rows[0];
            if (sessionResult.rows.length !== 1 || sessionRow === undefined) {
              throw new Error('Guest promotion current session did not resolve exactly one row.');
            }
            const guestSessionId = requireUuidText('guest session id', sessionRow.guestSessionId);
            const promotionResult = await client.query<PromotionRowV1>(PROMOTE_SQL, [
              resolvedSubject.subjectId,
              guestSessionId,
              memberEvidence.verifiedAuthUserId,
            ]);
            const row = promotionResult.rows[0];
            if (promotionResult.rows.length !== 1 || row === undefined) {
              throw new Error('Guest promotion authority did not return exactly one row.');
            }
            const subjectId = requireUuidText('subject id', row.subjectId);
            if (subjectId !== resolvedSubject.subjectId) {
              throw new Error('Guest promotion changed the canonical subject id.');
            }
            if (row.subjectKind !== 'member' || row.subjectStatus !== 'active' || typeof row.replayed !== 'boolean') {
              throw new Error('Guest promotion authority returned an invalid member state.');
            }
            return Object.freeze({
              subjectId,
              kind: 'member' as const,
              status: 'active' as const,
              replayed: row.replayed,
            });
          },
        });
        return envelope(result, requestId, serverTime);
      } catch (error) {
        const constraint = postgresConstraint(error);
        if (constraint === 'cmd_guest_promote_existing_member_requires_merge') {
          return failure('GUEST_MERGE_REQUIRED', 409, requestId);
        }
        if (
          constraint === 'cmd_guest_promote_session_expired' ||
          constraint === 'cmd_guest_promote_session_consumed' ||
          constraint === 'cmd_guest_promote_subject_ineligible' ||
          constraint === 'guest_bootstrap_current_unresolved'
        ) {
          return failure('GUEST_SESSION_NOT_PROMOTABLE', 409, requestId);
        }
        throw error;
      }
    },
    close() {
      return pool.close();
    },
  });
}
