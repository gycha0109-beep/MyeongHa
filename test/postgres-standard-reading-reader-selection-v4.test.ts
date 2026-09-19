import { describe, expect, it } from 'vitest';
import {
  POSTGRES_STANDARD_READING_READER_CATALOG_BINDING_V4,
  POSTGRES_STANDARD_READING_READER_UNLOCK_BINDING_V4,
  createPostgresStandardReadingReaderSelectionPortV4,
  createPostgresStandardReadingReaderSelectionPortsV4,
} from '../apps/api/src/postgres-standard-reading-reader-selection-v4.js';
import type {
  PostgresQueryResultV1,
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = 'd1075100-0000-0000-0000-000000000001';
const PRODUCT_ID = '11300000-0000-0000-0000-000000000001';
const READER_ID = 'baekheon';
const BUNDLE_ID = 'd1075100-0000-0000-0000-000000000002';

class FakeClient implements PostgresTransactionQueryV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  catalogRows: readonly Record<string, unknown>[] = [{
    productId: PRODUCT_ID,
    topicKey: 'love_relationship',
    specVersion: 'v1',
    readerSelectionMode: 'required',
    purchaseUnitMode: 'topic_reader_reading',
    readerCharacterId: READER_ID,
    readerContentBundleId: BUNDLE_ID,
    catalogAvailability: 'available',
    catalogEnabled: true,
  }];
  unlockRows: readonly Record<string, unknown>[] = [];

  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): PostgresQueryResultV1<Row> {
    this.calls.push({ text, values });
    if (text.includes(POSTGRES_STANDARD_READING_READER_CATALOG_BINDING_V4)) {
      return { rows: this.catalogRows as readonly Row[] };
    }
    if (text.includes(POSTGRES_STANDARD_READING_READER_UNLOCK_BINDING_V4)) {
      return { rows: this.unlockRows as readonly Row[] };
    }
    throw new Error('Unexpected Standard Reading Reader PostgreSQL query.');
  }
}

describe('PostgreSQL Standard Reading Reader selection data-source v4', () => {
  it('binds Product + Reader to the server-owned active catalog projection', async () => {
    const client = new FakeClient();
    const ports = createPostgresStandardReadingReaderSelectionPortsV4(client);
    await expect(ports.catalogPort.resolveReaderCatalog({
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    })).resolves.toMatchObject({
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
      readerContentBundleId: BUNDLE_ID,
      catalogAvailability: 'available',
      catalogEnabled: true,
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.text).toContain(
      'from public.qry_standard_reading_reader_catalog_v4($1::uuid, $2::text)',
    );
    expect(client.calls[0]?.values).toEqual([PRODUCT_ID, READER_ID]);
  });

  it('does not read unlock state for an available Reader', async () => {
    const client = new FakeClient();
    const port = createPostgresStandardReadingReaderSelectionPortV4(client);
    await expect(port.resolveEligibleReaderSelection({
      subjectId: SUBJECT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    })).resolves.toEqual({
      productId: PRODUCT_ID,
      topicKey: 'love_relationship',
      specVersion: 'v1',
      readerCharacterId: READER_ID,
      readerContentBundleId: BUNDLE_ID,
    });
    expect(client.calls).toHaveLength(1);
  });

  it('requires the already-stored subject unlock projection for an unlockable Reader', async () => {
    const client = new FakeClient();
    client.catalogRows = [{
      ...client.catalogRows[0],
      catalogAvailability: 'unlockable',
    } as Record<string, unknown>];
    client.unlockRows = [{ status: 'unlocked' }];

    const port = createPostgresStandardReadingReaderSelectionPortV4(client);
    await expect(port.resolveEligibleReaderSelection({
      subjectId: SUBJECT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    })).resolves.toMatchObject({
      readerCharacterId: READER_ID,
      readerContentBundleId: BUNDLE_ID,
    });
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.text).toContain(
      'from public.qry_standard_reading_reader_unlock_v4($1::uuid, $2::text)',
    );
    expect(client.calls[1]?.values).toEqual([SUBJECT_ID, READER_ID]);
  });

  it('fails closed when catalog or unlock authority is absent', async () => {
    const missingCatalog = new FakeClient();
    missingCatalog.catalogRows = [];
    const missingCatalogPort = createPostgresStandardReadingReaderSelectionPortV4(missingCatalog);
    await expect(missingCatalogPort.resolveEligibleReaderSelection({
      subjectId: SUBJECT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    })).resolves.toBeNull();

    const missingUnlock = new FakeClient();
    missingUnlock.catalogRows = [{
      ...missingUnlock.catalogRows[0],
      catalogAvailability: 'unlockable',
    } as Record<string, unknown>];
    const missingUnlockPort = createPostgresStandardReadingReaderSelectionPortV4(missingUnlock);
    await expect(missingUnlockPort.resolveEligibleReaderSelection({
      subjectId: SUBJECT_ID,
      productId: PRODUCT_ID,
      readerCharacterId: READER_ID,
    })).resolves.toBeNull();
  });

  it('rejects duplicate or malformed trusted DB projections', async () => {
    const duplicate = new FakeClient();
    duplicate.catalogRows = [duplicate.catalogRows[0]!, duplicate.catalogRows[0]!];
    await expect(
      createPostgresStandardReadingReaderSelectionPortsV4(duplicate).catalogPort.resolveReaderCatalog({
        productId: PRODUCT_ID,
        readerCharacterId: READER_ID,
      }),
    ).rejects.toThrow(/multiple rows/);

    const malformed = new FakeClient();
    malformed.catalogRows = [{ ...malformed.catalogRows[0], catalogEnabled: 'yes' }];
    await expect(
      createPostgresStandardReadingReaderSelectionPortsV4(malformed).catalogPort.resolveReaderCatalog({
        productId: PRODUCT_ID,
        readerCharacterId: READER_ID,
      }),
    ).rejects.toThrow(/catalog enabled flag is invalid/);

    const malformedUnlock = new FakeClient();
    malformedUnlock.unlockRows = [{ status: 'future-state' }];
    await expect(
      createPostgresStandardReadingReaderSelectionPortsV4(malformedUnlock).unlockProjectionPort.resolveCharacterUnlock({
        subjectId: SUBJECT_ID,
        readerCharacterId: READER_ID,
      }),
    ).rejects.toThrow(/unlock status is invalid/);
  });
});
