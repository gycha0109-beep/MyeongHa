import { timingSafeEqual } from 'node:crypto';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
  type SupabaseMemberVerifierFetchV1,
} from './supabase-member-identity-verifier.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { readBoundedUpstreamJsonTextV1, SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1 } from './upstream-json-response-resource.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface AdminOwnerIdentityV1 {
  readonly authUserId: string;
}

export interface AdminAuthPortV1 {
  verifyOwner(request: Request): Promise<AdminOwnerIdentityV1 | null>;
}

export interface AdminMemberIdentityConfigV1 {
  readonly ownerAuthUserId: string;
  readonly ownerEmail: string;
  readonly supabaseOrigin: string;
  readonly supabaseApiKey: string;
  readonly fetchImpl?: SupabaseMemberVerifierFetchV1;
}

function normalizedOwnerId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('Administrator Owner auth identity is not explicitly configured.');
  }
  return value.toLowerCase();
}

export function createAdminOwnerAuthV1(input: {
  readonly identityVerifier: IdentityEvidenceVerificationPortV1;
  readonly ownerAuthUserId: string;
}): AdminAuthPortV1 {
  const owner = Buffer.from(normalizedOwnerId(input.ownerAuthUserId), 'utf8');
  return Object.freeze({
    async verifyOwner(request: Request): Promise<AdminOwnerIdentityV1 | null> {
      const evidence = await input.identityVerifier.verifyRequestIdentity(request);
      if (evidence?.kind !== 'member') return null;
      const candidate = evidence.verifiedAuthUserId;
      if (typeof candidate !== 'string' || !UUID.test(candidate)) return null;
      const bytes = Buffer.from(candidate.toLowerCase(), 'utf8');
      if (bytes.length !== owner.length || !timingSafeEqual(bytes, owner)) return null;
      return Object.freeze({ authUserId: candidate.toLowerCase() });
    },
  });
}

/**
 * Admin authentication is NOT an ordinary subject-authenticated endpoint.
 * Only Supabase-verified member credentials and a separately configured,
 * server-only, exact Owner allowlist entry can authorize administration.
 * It never accepts Guest evidence, a client-supplied email field or role, or
 * a subjectId. Production deployment requires an independent gate.
 */
export function createAdminSupabaseOwnerAuthV1(
  config: AdminMemberIdentityConfigV1,
): AdminAuthPortV1 {
  if (typeof config.ownerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(config.ownerEmail)) throw new Error('Administrator Owner email is not explicitly configured.');
  const ownerEmail=config.ownerEmail.toLowerCase();
  const upstream=config.fetchImpl??globalThis.fetch;
  const identityVerifier = new SupabaseMemberIdentityEvidenceVerifierV1({
    supabaseOrigin: config.supabaseOrigin,
    supabaseApiKey: config.supabaseApiKey,
    // Bind the email and UUID from the same authenticated provider response.
    // Neither browser email fields nor unsigned JWT claims establish this link.
    fetchImpl: async (url,init) => {
      const response=await upstream(url,init);
      if(!response.ok)return response;
      const text=await readBoundedUpstreamJsonTextV1(response,{
        maximumBodyBytes:SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1,
        ...(init?.signal===undefined||init.signal===null?{}:{signal:init.signal}),
      });
      const user=JSON.parse(text) as {id?:unknown;email?:unknown};
      if(typeof user?.email!=='string'||user.email.toLowerCase()!==ownerEmail)return Response.json({error:'ADMIN_OWNER_BINDING_MISMATCH'},{status:403});
      return Response.json({id:user.id});
    },
  });
  return createAdminOwnerAuthV1({
    identityVerifier,
    ownerAuthUserId: config.ownerAuthUserId,
  });
}
