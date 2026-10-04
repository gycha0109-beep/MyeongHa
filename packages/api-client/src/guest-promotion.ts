import {
  normalizeOpaqueGuestBearerV1,
  parseGuestCredentialV1,
  type GuestCredentialV1,
} from './credentials.js';
import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export interface GuestPromotionReceiptV1 {
  readonly subjectId: string;
  readonly kind: 'member';
  readonly status: 'active';
  readonly replayed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_GUEST_PROMOTION_RESPONSE_INVALID',
    message,
  );
}

function parseReceipt(
  value: unknown,
  expectedSubjectId: string,
): GuestPromotionReceiptV1 {
  if (
    !isRecord(value) ||
    typeof value.subjectId !== 'string' ||
    value.subjectId.length === 0 ||
    value.kind !== 'member' ||
    value.status !== 'active' ||
    typeof value.replayed !== 'boolean'
  ) {
    return invalid('Guest promotion response is invalid.');
  }
  if (value.subjectId !== expectedSubjectId) {
    return invalid('Guest promotion changed the canonical subject.');
  }
  return Object.freeze({
    subjectId: value.subjectId,
    kind: 'member' as const,
    status: 'active' as const,
    replayed: value.replayed,
  });
}

export async function promoteGuestToNewMemberV1(
  client: MyeongHaApiClientV1,
  memberBearer: string,
  guestCredentialInput: GuestCredentialV1,
): Promise<GuestPromotionReceiptV1> {
  const guestCredential = parseGuestCredentialV1(guestCredentialInput);
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/promote-guest',
    bearer: memberBearer,
    guestBearer: normalizeOpaqueGuestBearerV1(guestCredential.bearerToken),
    body: Object.freeze({}),
  });
  return parseReceipt(data, guestCredential.subjectId);
}
