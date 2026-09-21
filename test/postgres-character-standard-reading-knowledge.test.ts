import { describe, expect, it } from 'vitest';
import {
  createPostgresCharacterStandardReadingKnowledgePortsV1,
} from '../apps/api/src/postgres-character-standard-reading-knowledge.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

describe('PostgreSQL Character Standard Reading Reader Knowledge adapter', () => {
  it('binds metadata and raw source reads to the two transaction-bound Production runtime authorities', async () => {
    const calls: { text: string; values?: readonly unknown[] }[] = [];
    const client: PostgresTransactionQueryV1 = {
      async query<Row>(text: string, values?: readonly unknown[]) {
        calls.push(values === undefined ? { text } : { text, values });
        if (text.includes('qry_character_standard_reading_access_runtime_v1')) {
          return {
            rows: [{
              readingId: '11111111-1111-4111-8111-111111111111',
              readingSessionId: '22222222-2222-4222-8222-222222222222',
              productId: '33333333-3333-4333-8333-333333333333',
              topicKey: 'general',
              sajuDomain: 'general',
              readingPeriod: 'original',
              readingVariant: 'standard',
              sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
              productSpecVersion: 'standard-reading-v1',
              domainCapabilityVersion: 'general-v1',
              readingContractVersion: 'product-reading-response-v1',
              sajuEngineVersion: 'saju-engine-v1',
              responseHash: 'sha256:v1:official-reading-hash',
            }] as unknown as Row[],
          };
        }
        return {
          rows: [{
            readingId: '11111111-1111-4111-8111-111111111111',
            productId: '33333333-3333-4333-8333-333333333333',
            readerCharacterId: 'baekheon',
            readingContractVersion: 'product-reading-response-v1',
            productResponseState: 'complete',
            responseSnapshotJsonb: { schemaVersion: 'product-reading-response-v1' },
            responseHash: 'sha256:v1:official-reading-hash',
            completedAt: '2026-09-20T23:00:00.000Z',
          }] as unknown as Row[],
        };
      },
    };
    const ports = createPostgresCharacterStandardReadingKnowledgePortsV1(client);

    await ports.accessAuthorityPort.readAccessibleReadings({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      readerCharacterId: 'baekheon',
      effectiveAt: '2026-09-21T00:00:00.000Z',
    });
    await ports.artifactAuthorityPort.readArtifactSource({
      subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      readingId: '11111111-1111-4111-8111-111111111111',
      readerCharacterId: 'baekheon',
      effectiveAt: '2026-09-21T00:00:00.000Z',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain('qry_character_standard_reading_access_runtime_v1');
    expect(calls[0]?.values).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'baekheon',
      '2026-09-21T00:00:00.000Z',
    ]);
    expect(calls[1]?.text).toContain('qry_standard_reading_artifact_source_runtime_v1');
    expect(calls[1]?.values).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'baekheon',
      '2026-09-21T00:00:00.000Z',
    ]);
  });
});
