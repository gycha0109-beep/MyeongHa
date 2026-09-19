import { describe, expect, it } from 'vitest';
import {
  STANDARD_READING_READER_SELECTION_CONTRACT_V1,
  StandardReadingPurchaseIntentAuthorityPortErrorV4,
  type StandardReadingPurchaseIntentAuthorityPortV4,
} from '../apps/api/src/standard-reading-purchase-intent-create-command-v4.js';
import {
  STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4,
  createPostgresStandardReadingPurchaseIntentAuthorityPortV4,
} from '../apps/api/src/postgres-standard-reading-purchase-intent-v4.js';
import type {
  PostgresQueryResultV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = 'd1074200-0000-0000-0000-000000000001';
const INTENT_ID = 'd1074200-0000-0000-0000-000000000002';
const OFFER_ID = 'd1074200-0000-0000-0000-000000000003';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const BUNDLE_ID = 'd1074200-0000-0000-0000-000000000004';
const CAPABILITY_SET_ID = '11301000-0000-0000-0000-000000000001';

type AuthorityInput = Parameters<StandardReadingPurchaseIntentAuthorityPortV4['createPurchaseIntent']>[0];

const INPUT: AuthorityInput = Object.freeze({
  subjectId: SUBJECT_ID,
  purchaseIntentId: INTENT_ID,
  productOfferId: OFFER_ID,
  providerAccountLinkId: null,
  idempotencyKey: 'postgres-v4',
  requestHash: 'sha256:v1:request',
  offerSnapshotJsonb: Object.freeze({
    productOfferId: OFFER_ID,
    productId: PRODUCT_ID,
    platform: 'web',
    provider: 'portone_v2',
    externalProductId: 'future-standard-love',
  }),
  offerSnapshotHash: 'sha256:v1:offer',
  capabilitySnapshotJsonb: Object.freeze({
    capabilitySetId: CAPABILITY_SET_ID,
    definitionVersion: 'v1',
    definitionHash: 'sha256:definition',
  }),
  capabilitySnapshotHash: 'sha256:v1:capability',
  productId: PRODUCT_ID,
  readerCharacterId: 'baekheon',
  readerContentBundleId: BUNDLE_ID,
  readerSelectionContractVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
  readerSelectionSnapshotJsonb: Object.freeze({
    schemaVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
    productId: PRODUCT_ID,
    topicKey: 'love_relationship',
    specVersion: 'v1',
    readerCharacterId: 'baekheon',
    readerContentBundleId: BUNDLE_ID,
  }),
  readerSelectionHash: 'sha256:v1:reader',
});

class FakeClient implements PostgresTransactionQueryV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  error: unknown;
  row: Record<string, unknown> = {
    purchaseIntentId: INTENT_ID,
    productOfferId: OFFER_ID,
    providerAccountLinkId: null,
    status: 'created',
    offerSnapshotJsonb: INPUT.offerSnapshotJsonb,
    offerSnapshotHash: INPUT.offerSnapshotHash,
    expectedAmountMinor: '8900',
    expectedCurrency: 'KRW',
    chargeTermsVersion: 'future-charge-v1',
    capabilitySetId: CAPABILITY_SET_ID,
    capabilitySnapshotJsonb: INPUT.capabilitySnapshotJsonb,
    capabilitySnapshotHash: INPUT.capabilitySnapshotHash,
    readerCharacterId: INPUT.readerCharacterId,
    readerContentBundleId: BUNDLE_ID,
    readerSelectionSnapshotJsonb: INPUT.readerSelectionSnapshotJsonb,
    readerSelectionHash: INPUT.readerSelectionHash,
    replayed: false,
  };

  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): PostgresQueryResultV1<Row> {
    this.calls.push({ text, values });
    if (this.error !== undefined) throw this.error;
    return { rows: [this.row as Row] };
  }
}

describe('PostgreSQL Standard Reading Purchase Intent v4 authority adapter', () => {
  it('binds the exact 16-parameter atomic DB command and keeps Reader provenance server-owned', async () => {
    const client = new FakeClient();
    const port = createPostgresStandardReadingPurchaseIntentAuthorityPortV4(client);
    const rows = await port.createPurchaseIntent(INPUT);

    expect(STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4).toBe(
      'public.cmd_create_standard_reading_purchase_intent_v4',
    );
    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call?.text).toContain('from public.cmd_create_standard_reading_purchase_intent_v4(');
    expect(call?.values).toHaveLength(16);
    expect(call?.values).toEqual([
      SUBJECT_ID,
      INTENT_ID,
      OFFER_ID,
      null,
      'postgres-v4',
      'sha256:v1:request',
      JSON.stringify(INPUT.offerSnapshotJsonb),
      'sha256:v1:offer',
      JSON.stringify(INPUT.capabilitySnapshotJsonb),
      'sha256:v1:capability',
      PRODUCT_ID,
      'baekheon',
      BUNDLE_ID,
      STANDARD_READING_READER_SELECTION_CONTRACT_V1,
      JSON.stringify(INPUT.readerSelectionSnapshotJsonb),
      'sha256:v1:reader',
    ]);
    expect(rows).toEqual([expect.objectContaining({
      purchaseIntentId: INTENT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE_ID,
      readerSelectionHash: 'sha256:v1:reader',
      replayed: false,
    })]);
  });

  it('maps Reader availability races without leaking raw PostgreSQL errors', async () => {
    const client = new FakeClient();
    client.error = {
      code: '23514',
      constraint: 'ct_reader_selection_reader_unavailable',
      message: 'raw postgres reader detail',
    };
    const port = createPostgresStandardReadingPurchaseIntentAuthorityPortV4(client);
    try {
      await port.createPurchaseIntent(INPUT);
      throw new Error('Expected Reader authority error.');
    } catch (error) {
      expect(error).toBeInstanceOf(StandardReadingPurchaseIntentAuthorityPortErrorV4);
      expect((error as StandardReadingPurchaseIntentAuthorityPortErrorV4).code).toBe(
        'READER_UNAVAILABLE',
      );
      expect((error as Error).message).not.toContain('raw postgres');
    }
  });

  it('maps v3 idempotency conflicts and treats Reader provenance drift as trusted corruption', async () => {
    for (const [constraint, code] of [
      ['cmd_purchase_intent_v3_idempotency_conflict', 'IDEMPOTENCY_CONFLICT'],
      ['cmd_standard_reading_purchase_v4_replay_selection_conflict', 'READER_PROVENANCE_CONFLICT'],
      ['ct_reader_selection_snapshot_mismatch', 'READER_PROVENANCE_CONFLICT'],
    ] as const) {
      const client = new FakeClient();
      client.error = { code: '23514', constraint };
      const port = createPostgresStandardReadingPurchaseIntentAuthorityPortV4(client);
      await expect(port.createPurchaseIntent(INPUT)).rejects.toMatchObject({ code });
    }
  });

  it('fails closed on malformed authority rows', async () => {
    const client = new FakeClient();
    client.row = { ...client.row, readerContentBundleId: null };
    const port = createPostgresStandardReadingPurchaseIntentAuthorityPortV4(client);
    await expect(port.createPurchaseIntent(INPUT)).rejects.toThrow(
      /Reader content bundle id is invalid/,
    );
  });
});
