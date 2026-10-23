import { describe, expect, it } from 'vitest';
import {
  selectPrivateOfficialReaderCiphertextQueryV1,
  type OfficialReaderPrivateCiphertextSelectorV1,
} from './official-reader-private-paid-answer-query-v1.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BODY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THREAD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SAFE_MARKER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('S6 private paid Reader selector is bound to exact DB function', () => {
  it('binds a protected body ID to the two-argument S6 current-rights RPC only', () => {
    const found = selectPrivateOfficialReaderCiphertextQueryV1(
      SUBJECT, { kind: 'body', bodyId: BODY },
    );
    expect(found.values).toEqual([SUBJECT, BODY]);
    expect(found.sql).toContain('internal_qry_official_reader_paid_answer_ciphertext_v1(\n  $1::uuid, $2::uuid');
    expect(found.sql).not.toContain('paid_chat_marker_ciphertext_v1');
    expect(found.sql).not.toMatch(/\$3::uuid/u);
    expect(found.sql).toContain('encrypted_body as "encryptedBody"');
    expect(found.sql).not.toContain('body_text');
    expect(Object.isFrozen(found)).toBe(true);
    expect(Object.isFrozen(found.values)).toBe(true);
  });

  it('binds the exact Thread and safe Chat marker to the THREE-argument private resolver', () => {
    const found = selectPrivateOfficialReaderCiphertextQueryV1(
      SUBJECT.toUpperCase(), {
        kind: 'chat_marker', threadId: THREAD.toUpperCase(),
        safeMessageId: SAFE_MARKER.toUpperCase(),
      },
    );
    expect(found.values).toEqual([SUBJECT, THREAD, SAFE_MARKER]);
    expect(found.sql).toContain('internal_qry_official_reader_paid_chat_marker_ciphertext_v1(\n  $1::uuid, $2::uuid, $3::uuid');
    expect(found.sql).not.toContain('from public.internal_qry_official_reader_paid_answer_ciphertext_v1(');
    expect(found.sql).toContain('encrypted_body as "encryptedBody"');
    expect(found.sql).not.toContain('body_text');
    expect(found.sql).not.toContain(THREAD);
    expect(found.sql).not.toContain(SAFE_MARKER);
  });

  it('keeps the body and Chat marker projections byte-for-byte equivalent', () => {
    const body = selectPrivateOfficialReaderCiphertextQueryV1(SUBJECT, {
      kind: 'body', bodyId: BODY,
    });
    const marker = selectPrivateOfficialReaderCiphertextQueryV1(SUBJECT, {
      kind: 'chat_marker', threadId: THREAD, safeMessageId: SAFE_MARKER,
    });
    expect(body.sql.split('\nfrom public.')[0]).toBe(
      marker.sql.split('\nfrom public.')[0],
    );
  });

  it('fails closed on missing, extra, malformed or type-confused selectors', () => {
    const invalid: unknown[] = [
      null, {},
      { kind: 'body', bodyId: THREAD, safeMessageId: SAFE_MARKER },
      { kind: 'body', bodyId: 'not-a-uuid' },
      { kind: 'chat_marker', bodyId: BODY },
      { kind: 'chat_marker', threadId: THREAD },
      { kind: 'chat_marker', threadId: THREAD, safeMessageId: 'not-a-uuid' },
      { kind: 'chat_marker', threadId: THREAD, safeMessageId: SAFE_MARKER, bodyId: BODY },
      { kind: 'body', bodyId: BODY, kindOverride: 'chat_marker' },
    ];
    for (const value of invalid) {
      expect(() => selectPrivateOfficialReaderCiphertextQueryV1(
        SUBJECT, value as OfficialReaderPrivateCiphertextSelectorV1,
      )).toThrow('Invalid private Reader selector.');
    }
    expect(() => selectPrivateOfficialReaderCiphertextQueryV1(
      'not-a-subject', { kind: 'body', bodyId: BODY },
    )).toThrow('Invalid private Reader selector.');
  });
});
