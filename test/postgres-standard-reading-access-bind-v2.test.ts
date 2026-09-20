import { describe, expect, it } from 'vitest';
import {
  STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
  StandardReadingAccessBindAuthorityPortErrorV2,
  type StandardReadingAccessBindAuthorityPortV2,
} from '../apps/api/src/standard-reading-access-bind-command-v2.js';
import {
  STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2,
  createPostgresStandardReadingAccessBindAuthorityPortV2,
} from '../apps/api/src/postgres-standard-reading-access-bind-v2.js';
import type {
  PostgresQueryResultV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = 'd1211000-0000-0000-0000-000000000001';
const PURCHASE_INTENT_ID = 'd1211000-0000-0000-0000-000000000002';
const SESSION_ID = 'd1211000-0000-0000-0000-000000000003';
const READING_ID = 'd1211000-0000-0000-0000-000000000004';
const SOURCE_REVISION_ID = 'd1211000-0000-0000-0000-000000000005';
const GRANT_ID = 'd1211000-0000-0000-0000-000000000006';
const PRODUCT_ID = 'd1211000-0000-0000-0000-000000000007';
const BUNDLE_ID = 'd1211000-0000-0000-0000-000000000008';

type AuthorityInput = Parameters<StandardReadingAccessBindAuthorityPortV2['bindAccess']>[0];

const SNAPSHOT = Object.freeze({
  schemaVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
  purchaseIntentId: PURCHASE_INTENT_ID,
});

const INPUT: AuthorityInput = Object.freeze({
  subjectId: SUBJECT_ID,
  purchaseIntentId: PURCHASE_INTENT_ID,
  proposedReadingSessionId: SESSION_ID,
  proposedReadingId: READING_ID,
  requestHash: 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
  requestSnapshotJsonb: SNAPSHOT,
});

class FakeClient implements PostgresTransactionQueryV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  error: unknown;
  row: Record<string, unknown> = {
    purchaseIntentId: PURCHASE_INTENT_ID,
    entitlementGrantId: GRANT_ID,
    productId: PRODUCT_ID,
    readerCharacterId: 'baekheon',
    readerContentBundleId: BUNDLE_ID,
    readingSessionId: SESSION_ID,
    readingId: READING_ID,
    sourceBirthRevisionId: SOURCE_REVISION_ID,
    sajuDomain: 'relationship',
    domainCapabilityVersion: 'relationship-v2',
    accessRole: 'initial_reader',
    officialReadingCreated: true,
    interpretationCreated: true,
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

describe('PostgreSQL Official Standard Reading access bind v2 adapter', () => {
  it('binds the exact seven-parameter v2 DB authority', async () => {
    const client = new FakeClient();
    const port = createPostgresStandardReadingAccessBindAuthorityPortV2(client);
    const rows = await port.bindAccess(INPUT);

    expect(STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2).toBe(
      'public.cmd_bind_standard_reading_access_v2',
    );
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.text).toContain(
      'from public.cmd_bind_standard_reading_access_v2(',
    );
    expect(client.calls[0]?.values).toEqual([
      SUBJECT_ID,
      PURCHASE_INTENT_ID,
      SESSION_ID,
      READING_ID,
      INPUT.requestHash,
      STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      JSON.stringify(SNAPSHOT),
    ]);
    expect(rows).toEqual([client.row]);
  });

  it('maps official-reuse and exact-Grant failures to bounded authority errors', async () => {
    for (const [constraint, code] of [
      ['cmd_standard_reading_access_v2_entitlement_unavailable', 'ENTITLEMENT_UNAVAILABLE'],
      ['cmd_standard_reading_access_v2_entitlement_ambiguous', 'ENTITLEMENT_AMBIGUOUS'],
      ['cmd_standard_reading_access_v2_official_not_reusable', 'OFFICIAL_READING_NOT_REUSABLE'],
      ['cmd_standard_reading_access_v2_binding_conflict', 'BINDING_CONFLICT'],
      ['cmd_standard_reading_access_v2_reader_capability_unavailable', 'READER_CAPABILITY_UNAVAILABLE'],
    ] as const) {
      const client = new FakeClient();
      client.error = { code: '23514', constraint, message: 'raw postgres detail' };
      const port = createPostgresStandardReadingAccessBindAuthorityPortV2(client);

      try {
        await port.bindAccess(INPUT);
        throw new Error('Expected mapped authority failure.');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardReadingAccessBindAuthorityPortErrorV2);
        expect((error as StandardReadingAccessBindAuthorityPortErrorV2).code).toBe(code);
        expect((error as Error).message).not.toContain('raw postgres detail');
      }
    }
  });

  it('maps unknown duplicate trusted identities to internal server-id conflict', async () => {
    const client = new FakeClient();
    client.error = { code: '23505', constraint: 'unexpected_unique_constraint' };
    const port = createPostgresStandardReadingAccessBindAuthorityPortV2(client);
    await expect(port.bindAccess(INPUT)).rejects.toMatchObject({
      code: 'SERVER_ID_CONFLICT',
    });
  });

  it('fails closed on malformed Reader access authority rows', async () => {
    const client = new FakeClient();
    client.row = { ...client.row, accessRole: 'wrong-role' };
    const port = createPostgresStandardReadingAccessBindAuthorityPortV2(client);
    await expect(port.bindAccess(INPUT)).rejects.toThrow(/access role is invalid/);
  });
});
