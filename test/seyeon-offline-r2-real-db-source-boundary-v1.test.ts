import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  assembleSeyeonRuntimeContextV2,
  canonicalJson,
} from '../packages/domain/src/index.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  auditSeyeonOfflineR2ProviderRequestV1,
} from '../apps/api/src/seyeon-offline-r2-provider-ingress-audit-v1.js';
import {
  observeSeyeonOfflineR2DbSourceBindingV1,
  type SeyeonOfflineR2DbSourceObservationV1,
} from '../apps/api/src/seyeon-offline-r2-db-source-set-binding-v1.js';
import type {
  SeyeonOfflineS0ContextCandidateV1,
} from '../apps/api/src/seyeon-offline-s0-context-admission-v1.js';

const ENABLED = process.env.CI === 'true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG === '1' &&
  process.env.PGHOST === 'localhost' &&
  process.env.PGDATABASE === 'myeongha_seyeon_positive_pin_candidate_test';
const pool = ENABLED
  ? new Pool({ max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
  : null;
const S = 'd2000000-0000-4000-8000-000000000001';
const T = 'd4000000-0000-4000-8000-000000000001';
const TURN = 'd7000000-0000-4000-8000-000000000003';
const ATTEMPT = 'd7200000-0000-4000-8000-000000000003';
const USER_MESSAGE = 'd7100000-0000-4000-8000-000000000003';
const MEMORY_ID = 'd5000000-0000-4000-8000-000000000001';
const GRANT = 'd6000000-0000-4000-8000-000000000001';
const userText = 'R2 synthetic owner-provenance bridge only';

function digest(input: unknown) {
  return 'sha256:v1:' +
    createHash('sha256').update(canonicalJson(input)).digest('hex');
}
const memory = Object.freeze({
  kind: 'memory' as const,
  memoryId: 'memory:' + MEMORY_ID,
  claimKind: 'fact' as const,
  summary: 'synthetic fixture; never for Production source schema approval',
  sourceRef: 'memory:' + MEMORY_ID + ':grant:' + GRANT,
  relevance: .7,
  salience: .5,
});
const source = Object.freeze({
  recordKind: 'memory' as const,
  recordId: MEMORY_ID,
  grantId: GRANT,
  recordType: 'shared_detail',
  schemaVersion: 'memory-v1',
  projectedMemoryId: memory.memoryId,
  rawRecordDigest: digest({
    recordId: MEMORY_ID,
    originalGrantId: GRANT,
    fixture: 'only an application candidate, not a DB digest',
  }),
  projectedMemoryDigest: digest(memory),
  permitsAtomicCommit: false as const,
  permitsHttpReveal: false as const,
});
const selection = selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories: [memory],
  sourceCandidates: [source],
});
const currentUserMessage = Object.freeze({
  messageId: USER_MESSAGE,
  text: userText,
});
const recentMessages = Object.freeze([
  { ...currentUserMessage, role: 'user' as const },
]);
const candidate: SeyeonOfflineS0ContextCandidateV1 = {
  identity: { subjectId: S, threadId: T, turnId: TURN, attemptId: ATTEMPT,
    characterId: 'seyeon' },
  currentUserMessage,
  productionContext: {
    version: 'seyeon-production-context-v1',
    relationshipRevisionUsedForTurn: null,
    historyThroughRevision: 0,
    recentMessages: [],
    retrievedMemories: [memory],
    personalRecordAdmissions: [{
      recordKind: 'memory', recordId: MEMORY_ID,
      recordType: 'shared_detail', schemaVersion: 'memory-v1',
      reason: 'ADMITTED',
    }],
    personalRecordProjectionCandidates: [source],
    activeRelationshipEventCount: 0,
    relationshipHistoryRecords: [],
  },
  finalContext: {
    relationship: null,
    recentMessages,
    retrievedMemories: [memory],
  },
  selection,
  syntheticApprovedSchema: {
    recordType: 'shared_detail', schemaVersion: 'memory-v1',
  }, // Test-only override: SRC-25 remains unapproved.
  simulatedOtherIngress: {
    preflight: [], reader: [], disclosure: [], peer: [], external: [],
  },
};

const evidenceSql = `
  select
    s.attempt_id::text as "attemptId",
    s.subject_id::text as "subjectId",
    s.thread_id::text as "threadId",
    s.turn_id::text as "turnId",
    s.source_count as "sourceCount",
    s.selected_sources_digest as "selectedSourcesDigest",
    e.ordinal as "edgeOrdinal",
    e.record_kind as "recordKind",
    e.memory_id::text as "recordId",
    e.original_grant_id::text as "originalGrantId",
    e.record_type as "recordType",
    e.schema_version as "schemaVersion",
    e.original_granted_at as "originalGrantedAt",
    e.pg_payload_digest as "pinnedPayloadDigest",
    ('sha256:pg-jsonb:v1:' ||
      encode(sha256(convert_to(m.content_jsonb::text,'UTF8')),'hex'))
        as "currentPayloadDigest",
    (g.revoked_at is null and m.revoked_at is null and
     g.id=e.original_grant_id and g.subject_id=s.subject_id and
     g.memory_item_id=e.memory_id and
     g.grantee_character_id='seyeon' and
     m.subject_id=s.subject_id and
     m.source_kind='user_approved') as "exactOriginalGrantActive"
  from seyeon_positive_candidate.source_sets_r1 s
  join seyeon_positive_candidate.source_edges_r1 e
    on e.attempt_id=s.attempt_id
  join public.record_access_grants g
    on g.id=e.original_grant_id
  join public.memory_items m on m.id=e.memory_id
  where s.attempt_id=$1::uuid
  order by e.ordinal`;

describe.skipIf(!ENABLED)(
  'R2 offline actual PostgreSQL Attempt/Grant-to-native-Provider source binding',
  () => {
    afterAll(async () => { await pool?.end(); });

    it('joins one real DB immutable Pin and exact original Grant to the synthetic native interpreter; revoke/tamper HOLD', async () => {
      if (!pool) throw new Error('Disposable CI DB required');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // All fixture writes, including the generated Attempt, stay in this
        // transaction. No production role, API, public Provider or DB migration.
        await client.query(
          `select * from public.cmd_receive_chat_turn_v1(
            $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
            $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,
            $12::text,$13::text)`,
          [
            S,T,'synthetic-r2-db-source-bridge',
            'sha256:v1:synthetic-r2-owner-bridge','chat-request-v1',
            JSON.stringify({
              clientTurnId: 'synthetic-r2-db-source-bridge',
              text: userText, clientCapability: '0.0.1-dev',
            }),
            'd3100000-0000-4000-8000-000000000001',
            'd3000000-0000-4000-8000-000000000001',
            TURN, USER_MESSAGE, userText, null,
            'sha256:v1:synthetic-r2-owner-bridge-text',
          ],
        );
        await client.query(
          `select * from public.cmd_allocate_chat_turn_attempt_v1(
            $1::uuid,$2::uuid,$3::uuid,$4::text)`,
          [S,TURN,ATTEMPT,'seyeon-production-chat-planner-v1'],
        );
        await client.query('SET LOCAL ROLE myeongha_api_executor');
        await client.query(`select set_config('myeongha.subject_id',$1,true)`,[S]);
        const pinned = await client.query<{ pinned: boolean }>(
          `select seyeon_positive_candidate.pin_source_set_r1(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text)
            as pinned`,
          [S,T,TURN,ATTEMPT,JSON.stringify([
            { recordId: MEMORY_ID, grantId: GRANT },
          ]),selection.selectedSourcesDigest],
        );
        expect(pinned.rows[0]?.pinned).toBe(true);
        await client.query('SET LOCAL ROLE NONE');

        const e = await client.query<SeyeonOfflineR2DbSourceObservationV1 & {
          originalGrantedAt: Date;
        }>(evidenceSql,[ATTEMPT]);
        expect(e.rows).toHaveLength(1);
        expect(e.rows[0]?.sourceCount).toBe(1);
        const observation = {
          ...e.rows[0]!,
          originalGrantedAt: e.rows[0]!.originalGrantedAt.toISOString(),
        };
        const positive = observeSeyeonOfflineR2DbSourceBindingV1({
          candidate, observation,
        });
        expect(positive).toMatchObject({
          state:'db_source_shape_observed_offline_only',
          observationDigest:expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/),
          permitsProductionProvider:false,permitsProductionReveal:false,
        });

        const runtimeContext = assembleSeyeonRuntimeContextV2({
          relationship:null,relationshipSemantics:null,
          recentMessages,retrievedMemories:[memory],
          integrityDecisions:[],governedPreflightApplied:true,
          disclosure:{decision:null,retrievedSources:[]},
        });
        const request = buildSeyeonTurnInterpreterRequestV2(runtimeContext);
        expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request}).state)
          .toBe('observed_synthetic_only');
        for (const altered of [
          { ...observation,originalGrantId:'d6000000-0000-4000-8000-000000000099' },
          { ...observation,sourceCount:2 },
          { ...observation,edgeOrdinal:1 },
          { ...observation,selectedSourcesDigest:'sha256:v1:'+'f'.repeat(64) },
          { ...observation,attemptId:'d7200000-0000-4000-8000-000000000099' },
          { ...observation,pinnedPayloadDigest:'sha256:pg-jsonb:v1:'+'f'.repeat(64) },
        ]) {
          expect(observeSeyeonOfflineR2DbSourceBindingV1({
            candidate,observation:altered,
          }).state).toBe('held');
        }

        await client.query('SAVEPOINT revoke_original');
        await client.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
          [GRANT],
        );
        const revoked = await client.query<typeof observation>(evidenceSql,[ATTEMPT]);
        expect(revoked.rows[0]?.exactOriginalGrantActive).toBe(false);
        expect(observeSeyeonOfflineR2DbSourceBindingV1({
          candidate,observation:{
            ...observation, exactOriginalGrantActive:false,
          },
        }).state).toBe('held');
        await client.query('ROLLBACK TO SAVEPOINT revoke_original');

        await client.query('SAVEPOINT tamper_original');
        await client.query(
          'update public.memory_items set content_jsonb=$1::jsonb where id=$2::uuid',
          [JSON.stringify({v:'changed after Pin'}),MEMORY_ID],
        );
        const alteredPayload = await client.query<typeof observation>(evidenceSql,[ATTEMPT]);
        expect(alteredPayload.rows[0]?.currentPayloadDigest)
          .not.toBe(observation.pinnedPayloadDigest);
        expect(observeSeyeonOfflineR2DbSourceBindingV1({
          candidate,observation:{
            ...observation,
            currentPayloadDigest:alteredPayload.rows[0]!.currentPayloadDigest,
          },
        }).state).toBe('held');
        await client.query('ROLLBACK TO SAVEPOINT tamper_original');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  },
);
