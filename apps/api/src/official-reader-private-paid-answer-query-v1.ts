/**
 * S6 private SELECT shapes: body-id and safe Chat marker MUST dispatch to
 * distinct migrated functions. Never derive one using string substitution.
 * The caller still owns Subject/S1 lock/Privacy read-lease authorization.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CIPHERTEXT_PROJECTION = `
select
  body_id::text as "bodyId",
  thread_id::text as "threadId",
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  safe_message_id::text as "safeMessageId",
  official_reading_id::text as "officialReadingId",
  reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",
  content_release_id::text as "contentReleaseId",
  originating_entitlement_grant_id::text as "originatingGrantId",
  product_id::text as "productId",
  source_response_hash as "sourceResponseHash",
  encryption_scheme_version as "encryptionSchemeVersion",
  encryption_key_ref as "encryptionKeyRef",
  encryption_iv as "encryptionIv",
  encryption_auth_tag as "encryptionAuthTag",
  encrypted_body as "encryptedBody",
  committed_at::text as "committedAt"
`;
const BY_BODY = `${CIPHERTEXT_PROJECTION}
from public.internal_qry_official_reader_paid_answer_ciphertext_v1(
  $1::uuid, $2::uuid
)`;
const BY_CHAT_MARKER = `${CIPHERTEXT_PROJECTION}
from public.internal_qry_official_reader_paid_chat_marker_ciphertext_v1(
  $1::uuid, $2::uuid, $3::uuid
)`;

export type OfficialReaderPrivateCiphertextSelectorV1 =
  | Readonly<{ kind: 'body'; bodyId: string }>
  | Readonly<{ kind: 'chat_marker'; threadId: string; safeMessageId: string }>;

export interface OfficialReaderPrivateCiphertextQueryV1 {
  readonly sql: string;
  readonly values: readonly string[];
}

/** Bind only exact selector UUIDs; do not interpolate external values into SQL. */
export function selectPrivateOfficialReaderCiphertextQueryV1(
  subjectId: string,
  selector: OfficialReaderPrivateCiphertextSelectorV1,
): OfficialReaderPrivateCiphertextQueryV1 {
  if (!UUID.test(subjectId) || !selector || typeof selector !== 'object') {
    throw new Error('Invalid private Reader selector.');
  }
  if (selector.kind === 'body' && Object.keys(selector).length === 2
      && UUID.test(selector.bodyId)) {
    return Object.freeze({
      sql: BY_BODY,
      values: Object.freeze([subjectId.toLowerCase(), selector.bodyId.toLowerCase()]),
    });
  }
  if (selector.kind === 'chat_marker' && Object.keys(selector).length === 3
      && UUID.test(selector.threadId) && UUID.test(selector.safeMessageId)) {
    return Object.freeze({
      sql: BY_CHAT_MARKER,
      values: Object.freeze([
        subjectId.toLowerCase(),
        selector.threadId.toLowerCase(),
        selector.safeMessageId.toLowerCase(),
      ]),
    });
  }
  throw new Error('Invalid private Reader selector.');
}
