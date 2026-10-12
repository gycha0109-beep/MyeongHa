import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { canonicalJson } from '../packages/domain/src/index.js';

/**
 * G0 D-03: Disposable PG / Node dual-serializer characterization ONLY.
 *
 * The offline DB sidecar deliberately stores sha256:pg-jsonb:v1, whereas
 * the Character projector uses sha256:v1 over canonicalJson. Neither digest
 * provides authenticity, direct Grant authority or a production format.
 */
const ENABLED = process.env.CI === 'true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG === '1' &&
  process.env.PGHOST === 'localhost' &&
  process.env.PGDATABASE === 'myeongha_seyeon_positive_pin_candidate_test';

const pool = ENABLED
  ? new Pool({ max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
  : null;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const PINNED_ATTEMPT = 'd7200000-0000-4000-8000-000000000001';

describe.skipIf(!ENABLED)(
  'D-03 offline digest boundaries: real PostgreSQL JSONB bytes vs Node canonical JSON',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it.each([
      ['empty JSON object', {}],
      ['key order and whitespace', { z: 7, a: 1, c: '한글 🚀' }],
      ['nested map and nullable value', {
        nested: { z: true, a: null }, list: [false, 2.5, 'two'],
      }],
      ['Unicode and escaped characters', {
        note: '줄바꿈\n과 \\ 역슬래시', labels: ['é', 'e\u0301'],
      }],
      ['non-empty primitive array', [0, true, { x: 'hello' }]],
    ] as const)(
      '%s is self-consistent within each serializer; never cross-label hashes',
      async (_, payload) => {
        if (!pool) throw new Error('This scenario requires disposable PostgreSQL.');
        // Pass JSON text as a bound parameter; do not interpolate arbitrary
        // sample data into executable SQL or trust a caller's digest label.
        const query = await pool.query<{
          dbName: string;
          pgJsonbText: string;
          pgDigest: string;
        }>(`
          select
            current_database() as "dbName",
            ($1::jsonb)::text as "pgJsonbText",
            encode(sha256(convert_to(($1::jsonb)::text, 'UTF8')), 'hex')
              as "pgDigest"
        `, [JSON.stringify(payload)]);
        expect(query.rows).toHaveLength(1);
        const row = query.rows[0]!;
        expect(row.dbName).toBe('myeongha_seyeon_positive_pin_candidate_test');
        expect(row.pgDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(row.pgDigest).toBe(sha(row.pgJsonbText));

        const nodeBytes = canonicalJson(payload);
        expect(sha(nodeBytes)).toMatch(/^[0-9a-f]{64}$/);
        // Equivalent JSON values need not have the same *serialized bytes*.
        expect(canonicalJson(JSON.parse(row.pgJsonbText))).toBe(nodeBytes);
        expect('sha256:pg-jsonb:v1:' + row.pgDigest)
          .not.toBe('sha256:v1:' + sha(nodeBytes));
      },
    );

    it('demonstrates concretely different byte encodings for an object', async () => {
      if (!pool) throw new Error('Disposable PostgreSQL only.');
      const payload = { z: 2, a: 1 };
      const result = await pool.query<{ text: string }>(
        'select ($1::jsonb)::text as text', [JSON.stringify(payload)],
      );
      const dbBytes = result.rows[0]!.text;
      const nodeBytes = canonicalJson(payload);
      expect(nodeBytes).toBe('{"a":1,"z":2}');
      expect(dbBytes).not.toBe(nodeBytes);
      expect(sha(dbBytes)).not.toBe(sha(nodeBytes));
    });

    it('actual Attempt Pin stores PG serializer digest over current real Memory JSONB', async () => {
      if (!pool) throw new Error('Disposable PostgreSQL only.');
      const result = await pool.query<{
        dbName: string;
        originalGrantId: string;
        dbRawDigest: string;
        originalJsonbText: string;
        expectedPgSha: string;
      }>(`
        select current_database() as "dbName",
               p.original_grant_id::text as "originalGrantId",
               p.original_raw_digest as "dbRawDigest",
               m.content_jsonb::text as "originalJsonbText",
               encode(sha256(convert_to(m.content_jsonb::text, 'UTF8')), 'hex')
                 as "expectedPgSha"
        from seyeon_positive_candidate.attempt_source_pins p
        join public.memory_items m
          on m.id=p.original_memory_id and m.subject_id=p.subject_id
        where p.attempt_id=$1::uuid and p.original_record_kind='memory'
      `, [PINNED_ATTEMPT]);
      expect(result.rows).toHaveLength(1);
      const row = result.rows[0]!;
      expect(row.dbName).toBe('myeongha_seyeon_positive_pin_candidate_test');
      expect(row.originalGrantId)
        .toBe('d6000000-0000-4000-8000-000000000001');
      expect(row.dbRawDigest).toBe('sha256:pg-jsonb:v1:' + row.expectedPgSha);
      expect(row.expectedPgSha).toBe(sha(row.originalJsonbText));
      // Projection hashes must NOT be passed as raw-record hash or compared
      // directly to the pg-jsonb digest without an approved versioned codec.
      expect(row.dbRawDigest).not.toBe(
        'sha256:v1:' + sha(canonicalJson(JSON.parse(row.originalJsonbText))),
      );
    });
  },
);
