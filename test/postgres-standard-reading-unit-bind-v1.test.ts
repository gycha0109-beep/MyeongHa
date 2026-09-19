import { describe, expect, it } from 'vitest';
import {
  STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
  StandardReadingUnitBindAuthorityPortErrorV1,
  type StandardReadingUnitBindAuthorityPortV1,
} from '../apps/api/src/standard-reading-unit-bind-command-v1.js';
import {
  STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1,
  createPostgresStandardReadingUnitBindAuthorityPortV1,
} from '../apps/api/src/postgres-standard-reading-unit-bind-v1.js';
import type {
  PostgresQueryResultV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = 'd1089100-0000-0000-0000-000000000001';
const PURCHASE_INTENT_ID = 'd1089100-0000-0000-0000-000000000002';
const SESSION_ID = 'd1089100-0000-0000-0000-000000000003';
const READING_ID = 'd1089100-0000-0000-0000-000000000004';
const SOURCE_PROFILE_ID = 'd1089100-0000-0000-0000-000000000005';
const SOURCE_REVISION_ID = 'd1089100-0000-0000-0000-000000000006';
const GRANT_ID = 'd1089100-0000-0000-0000-000000000007';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const BUNDLE_ID = 'd1089100-0000-0000-0000-000000000008';

type AuthorityInput = Parameters<StandardReadingUnitBindAuthorityPortV1['bindUnit']>[0];

const SNAPSHOT = Object.freeze({
  schemaVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
  purchaseIntentId: PURCHASE_INTENT_ID,
  sourceBirthProfileId: SOURCE_PROFILE_ID,
});

const INPUT: AuthorityInput = Object.freeze({
  subjectId: SUBJECT_ID,
  purchaseIntentId: PURCHASE_INTENT_ID,
  readingSessionId: SESSION_ID,
  readingId: READING_ID,
  requestHash: 'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  requestContractVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
  requestSnapshotJsonb: SNAPSHOT,
  sourceBirthProfileId: SOURCE_PROFILE_ID,
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
    attemptNo: 1,
    sourceBirthRevisionId: SOURCE_REVISION_ID,
    sajuDomain: 'relationship',
    domainCapabilityVersion: 'relationship-v1',
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

describe('PostgreSQL Standard Reading unit bind v1 adapter', () => {
  it('binds the exact 8-parameter fail-closed DB command', async () => {
    const client = new FakeClient();
    const port = createPostgresStandardReadingUnitBindAuthorityPortV1(client);
    const rows = await port.bindUnit(INPUT);

    expect(STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_bind_standard_reading_unit_v1',
    );
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.text).toContain(
      'from public.cmd_bind_standard_reading_unit_v1(',
    );
    expect(client.calls[0]?.values).toEqual([
      SUBJECT_ID,
      PURCHASE_INTENT_ID,
      SESSION_ID,
      READING_ID,
      INPUT.requestHash,
      STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
      JSON.stringify(SNAPSHOT),
      SOURCE_PROFILE_ID,
    ]);
    expect(rows).toEqual([{
      purchaseIntentId: PURCHASE_INTENT_ID,
      entitlementGrantId: GRANT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: 'baekheon',
      readerContentBundleId: BUNDLE_ID,
      readingSessionId: SESSION_ID,
      readingId: READING_ID,
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      sajuDomain: 'relationship',
      domainCapabilityVersion: 'relationship-v1',
      replayed: false,
    }]);
  });

  it('maps entitlement and binding constraints without exposing raw PostgreSQL detail', async () => {
    for (const [constraint, code] of [
      ['cmd_standard_reading_unit_entitlement_unavailable', 'ENTITLEMENT_UNAVAILABLE'],
      ['cmd_standard_reading_unit_entitlement_ambiguous', 'ENTITLEMENT_AMBIGUOUS'],
      ['cmd_standard_reading_unit_binding_conflict', 'BINDING_CONFLICT'],
      ['cmd_reading_create_source_profile_not_found', 'SOURCE_PROFILE_NOT_FOUND'],
      ['ct_reading_character_capability', 'READER_CAPABILITY_UNAVAILABLE'],
    ] as const) {
      const client = new FakeClient();
      client.error = {
        code: '23514',
        constraint,
        message: 'raw postgres detail',
      };
      const port = createPostgresStandardReadingUnitBindAuthorityPortV1(client);

      try {
        await port.bindUnit(INPUT);
        throw new Error('Expected mapped authority failure.');
      } catch (error) {
        expect(error).toBeInstanceOf(StandardReadingUnitBindAuthorityPortErrorV1);
        expect((error as StandardReadingUnitBindAuthorityPortErrorV1).code).toBe(code);
        expect((error as Error).message).not.toContain('raw postgres detail');
      }
    }
  });

  it('maps duplicate server identities to an internal authority code', async () => {
    const client = new FakeClient();
    client.error = { code: '23505', constraint: 'some_unexpected_unique_constraint' };
    const port = createPostgresStandardReadingUnitBindAuthorityPortV1(client);

    await expect(port.bindUnit(INPUT)).rejects.toMatchObject({
      code: 'SERVER_ID_CONFLICT',
    });
  });

  it('fails closed on malformed authority rows', async () => {
    const client = new FakeClient();
    client.row = { ...client.row, entitlementGrantId: null };
    const port = createPostgresStandardReadingUnitBindAuthorityPortV1(client);
    await expect(port.bindUnit(INPUT)).rejects.toThrow(
      /Entitlement Grant id is invalid/,
    );
  });
});
