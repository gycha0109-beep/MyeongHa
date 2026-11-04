// Watchtower-Track: security
// Actual production-table SQL and existing TS ports; synthetic identities only.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import { createSeyeonPositiveS0OwnerDbPortsV1 } from '../apps/api/src/postgres-seyeon-positive-memory-source-runtime-v1.js';
import { createSeyeonG1HistoricalCandidateOwnerPortV1 } from '../apps/api/src/postgres-seyeon-g1-historical-candidate-port-v1.js';
import { createSeyeonFirstPositiveMemoryLockedReadV1 } from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import { revokeSeyeonOriginalMemoryGrantAndAckV1 } from '../apps/api/src/seyeon-original-grant-revoke-ack-v1.js';
import { acceptSeyeonPrivateConversationRecallProposalV1 } from '../apps/api/src/postgres-seyeon-private-memory-proposal-accept-v1.js';
import { createSeyeonOwnedOriginalGrantV1 } from '../apps/api/src/postgres-seyeon-owned-original-grant-v1.js';
import { readSeyeonPendingPlannerMemoryDecisionSourceV1 } from '../apps/api/src/postgres-seyeon-planner-memory-decision-source-v1.js';
import { createPendingSeyeonPlannerMemoryProposalV1 } from '../apps/api/src/postgres-seyeon-planner-memory-proposal-producer-v1.js';
import { verifySeyeonPlannerPreModelSourceV1 } from '../apps/api/src/postgres-seyeon-planner-pre-model-source-v1.js';
import { inspectSeyeonPlannerDisplayCandidateS0V1 } from '../apps/api/src/postgres-seyeon-planner-memory-display-candidate-v1.js';
import { handleSeyeonPendingPlannerNodeHttpS0V1 } from '../apps/api/src/seyeon-planner-pending-proposal-node-http-s0-v1.js';
import { handleSeyeonPlannerDecisionNodeHttpS0V1 } from '../apps/api/src/seyeon-planner-memory-decision-node-http-s0-v1.js';
import { handleSeyeonFirstOriginalAssistantReplayNodeS0V1 } from '../apps/api/src/seyeon-first-original-assistant-replay-node-s0-v1.js';
import { handleSeyeonFirstOriginalDialoguePairNodeS0V1 } from '../apps/api/src/seyeon-first-original-dialogue-pair-node-s0-v1.js';
import { planSeyeonPlannerMemoryDecisionV1 } from '../apps/api/src/seyeon-planner-memory-decision-v1.js';
import { commitSeyeonSingleCharacterPlannerGrantDecisionV1 } from '../apps/api/src/seyeon-planner-memory-decision-commit-v1.js';
import { commitSeyeonPlannerMemoryDecisionS0V1 } from '../apps/api/src/seyeon-planner-memory-decision-commit-v1.js';
import { handleSeyeonFirstPositiveMemoryDirectNodeHttpV1 } from '../apps/api/src/seyeon-first-positive-memory-node-http-ingress-v1.js';
import { handleSeyeonFirstPositiveMemoryFetchV1,handleSeyeonPositiveReplyReceiptV1 } from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import { handleSeyeonPositiveReceiptAndCreditCandidateV1 }
  from '../apps/api/src/seyeon-g4-positive-receipt-credit-bridge-candidate-v1.js';
import { recoverSeyeonG5ReceivedCreditsCandidateV1 }
  from '../apps/api/src/seyeon-g5-received-credit-recovery-candidate-v1.js';
import { executePostgresCommerceInternalTransactionV1 }
  from '../apps/api/src/postgres-commerce-internal-execution.js';
import {
  SEYEON_G5_PRIVATE_COMMERCE_DB_V1,
  SeyeonG5PrivateCommercePostgresPoolV1,
  SeyeonG5PrivateCommerceBoundaryErrorV1,
} from '../apps/api/src/seyeon-g5-private-commerce-postgres-pool-v1.js';
import {handleSeyeonMemberMemoryGrantStatusRequestV1} from '../apps/api/src/seyeon-member-memory-grant-status-http-v1.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import { composeSeyeonProductionContextV1, type SeyeonProductionContextSnapshotV1 } from '../apps/api/src/seyeon-production-context-v1.js';
import { createPostgresSeyeonProductionContextReadAuthorityPortV1 } from '../apps/api/src/postgres-seyeon-production-context-read-v1.js';
import { SEYEON_CONVERSATION_RECALL_PROJECTOR_V1 } from '../apps/api/src/seyeon-conversation-recall-memory-contract-v1.js';
import { selectSeyeonExactModelPersonalSourcesV1 } from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';

const enabled = process.env.SEYEON_SECURITY_S0_REAL_PG === '1';
const receiptProof=(text:string,challenge:string)=>createHash('sha256').update('seyeon-positive-http-receipt-v1\n'+Buffer.byteLength(text,'utf8')+':'+text+':'+createHash('sha256').update(challenge).digest('hex')).digest('hex');
const hash = (value: unknown) => 'sha256:v1:' + createHash('sha256').update(canonicalJson(value)).digest('hex');
const uuid = (part: number, n: number) => `a8${part}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const baseline = readFileSync(new URL('./db/seyeon_first_zero_locked_reveal_disposable_pg17.sql', import.meta.url), 'utf8')
  .replace(/\r\n/gu, '\n').replace(/^\\set.*$/gmu, '');
const seedEnd = baseline.indexOf('BEGIN;\nset local role myeongha_api_executor;');
const generationStart = baseline.indexOf('insert into public.ai_execution_logs(');
const generationEnd = baseline.indexOf('select turn_id,assistant_message_id,replayed from');
if (seedEnd < 0 || generationStart < 0 || generationEnd < 0) throw Error('Existing real Chat fixture phases unavailable.');

describe.skipIf(!enabled)('S0 actual original Pin → v2 Commit → locked first Reveal → revoke', () => {
  let pool: Pool;
  let ordinaryPool: Pool | undefined;
  let subjectPool: PostgresSubjectPoolV1;
  beforeAll(async () => {
    const db = process.env.PGDATABASE ?? '';
    if (!['localhost', '127.0.0.1', '::1'].includes(process.env.PGHOST ?? '') ||
        !(db === 'myeongha_seyeon_security_s0_test' ||
          (process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' &&
           process.env.DB_SUITE === 'postgres17' && /^myeongha_ci_case_[0-9]+$/u.test(db)))) {
      throw Error('S0 real tests require the named disposable database.');
    }
    const adminUser=process.env.SEYEON_S0_TEST_ADMIN_USER??'postgres';
    const ordinaryUser=process.env.SEYEON_S0_TEST_ORDINARY_USER;
    if(!['postgres','supabase_admin'].includes(adminUser)||
       (ordinaryUser!==undefined&&ordinaryUser!=='myeongha_s0_receipt_test_login')){
      throw Error('Unsupported isolated fixture principals');
    }
    pool = new Pool({
      host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432),
      user: adminUser, database: db, password: process.env.PGPASSWORD,
      ssl: false, max: 4, statement_timeout: 5000,
    });
    if(ordinaryUser!==undefined){ordinaryPool=new Pool({host:process.env.PGHOST,
      port:Number(process.env.PGPORT??5432),user:ordinaryUser,database:db,
      password:process.env.PGPASSWORD,ssl:false,max:4,statement_timeout:5000});}
    subjectPool = (ordinaryPool??pool) as unknown as PostgresSubjectPoolV1;
    // These are isolated test admissions, NEVER deployment instructions.
    await pool.query(`insert into public.seyeon_positive_source_type_registry_v1
      values('memory','conversation_recall','v1','seyeon-conversation-recall-projector-v1',true,true);
      grant execute on function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text) to myeongha_api_executor;
      -- The following narrow Grant exists ONLY inside this disposable S0
      -- fixture; the installed source remains API-closed by default.
      grant usage on schema seyeon_private to myeongha_api_executor;
      grant execute on function seyeon_private.pin_model_recent_sources_v1(
        uuid,uuid,uuid,uuid,uuid,jsonb,text) to myeongha_api_executor;
      grant execute on function public.cmd_commit_seyeon_positive_chat_turn_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text) to myeongha_api_executor;
      grant execute on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) to myeongha_api_executor;
      grant execute on function public.cmd_accept_seyeon_private_conversation_recall_proposal_v1(
        uuid,uuid,uuid) to myeongha_api_executor;
      grant execute on function public.cmd_grant_seyeon_owned_conversation_recall_v1(
        uuid,uuid,uuid) to myeongha_api_executor;
      grant usage on schema seyeon_private to myeongha_api_executor;
      grant execute on function seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(uuid,uuid)
        to myeongha_api_executor;
      grant execute on function seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(uuid,uuid,uuid,uuid,uuid,text,text)
        to myeongha_api_executor;
      grant execute on function seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(uuid,uuid,text)
        to myeongha_api_executor;
       grant execute on function seyeon_private.qry_pending_seyeon_planner_display_candidate_v1(uuid,uuid,uuid)
         to myeongha_api_executor;
      grant execute on function seyeon_private.qry_seyeon_planner_pre_model_source_v1(uuid,uuid,uuid,uuid,text,text)
        to myeongha_api_executor;
      grant execute on function seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(uuid,uuid,uuid)
        to myeongha_api_executor;
      grant execute on function seyeon_private.qry_seyeon_first_original_dialogue_pair_s0_v1(uuid,uuid,uuid)
        to myeongha_api_executor;
      grant execute on function public.cmd_issue_seyeon_positive_first_reply_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea),
        seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text),
        seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)
        to myeongha_api_executor;`);
  });
  afterAll(async () => { await ordinaryPool?.end();await pool?.end(); });

  async function prepare(n: number, virtual?: { summary: string }, withRecentPin: boolean | 'invalid' = true) {
    const auth = uuid(10, n), subject = uuid(11, n), thread = uuid(14, n);
    const turn = uuid(16, n), attempt = uuid(17, n), user = uuid(18, n);
    const assistant = uuid(19, n), memory = uuid(24, n), grant = uuid(25, n);
    const userText = virtual === undefined ? 'Synthetic first hello' : '내가 주말에 뭐 한다고 했지?';
    const contentBundleHash = createHash('sha256')
      .update('seyeon-s0-pg17-content-bundle-fixture:v1:' + String(n))
      .digest('hex');
    const adapt = (sql: string) => sql.replaceAll('000000000001', String(n).padStart(12, '0'))
      .replaceAll('first-zero-test-v1', 'first-zero-test-v1-' + n)
      .replaceAll('first-zero-test-release', 'first-zero-test-release-' + n)
      .replaceAll('first-zero-disposable-v1', uuid(30, n))
      .replaceAll("repeat('a',64)", "'" + contentBundleHash + "'")
      .replaceAll('Synthetic first hello', userText);
    await pool.query(adapt(baseline.slice(0, seedEnd)));
    await pool.query(`insert into public.memory_items(
      id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,created_at)
      values($1,$2,'conversation_recall','v1',$3::jsonb,'user_approved','seyeon',clock_timestamp());
    `.trim(), [memory, subject, JSON.stringify({ summary: virtual?.summary ?? 'synthetic approved recall' })]);
    await pool.query(`insert into public.record_access_grants(
      id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at)
      values($1,$2,$3,'seyeon','user_choice',clock_timestamp())`, [grant, subject, memory]);
    const { rows: [raw] } = await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex') as digest
      from public.memory_items where id=$1`, [memory]);
    let source = {
      recordKind: 'memory' as const, recordId: memory, grantId: grant,
      recordType: 'conversation_recall', schemaVersion: 'v1',
      rawRecordDigest: hash({ summary: 'synthetic approved recall' }),
      rawRecordPgDigest: raw.digest as string,
      projectedMemoryDigest: hash({ memoryId: memory, summary: 'synthetic approved recall' }),
      projectorVersion: 'seyeon-conversation-recall-projector-v1',
    };
    const evidence = { kind: 'member' as const, verifiedAuthUserId: auth };
    const run = <T>(execute: Parameters<typeof executePostgresSubjectTransactionV1<T>>[0]['execute']) =>
      executePostgresSubjectTransactionV1({ pool: subjectPool, verifiedEvidence: evidence, execute });
    const readContext = () => run(({ client }) => composeSeyeonProductionContextV1({
      resolvedSubjectId: subject, threadId: thread, currentUserMessageRef: user,
      relationshipRevisionUsedForTurn: null,
      authorityPort: createPostgresSeyeonProductionContextReadAuthorityPortV1(client),
      serverOwnedPersonalRecordProjectors: [SEYEON_CONVERSATION_RECALL_PROJECTOR_V1],
      maxPersonalRecords: 1,
    }));
    let modelContext: SeyeonProductionContextSnapshotV1 | undefined;
    if (virtual !== undefined) {
      modelContext = await readContext();
      expect(modelContext.retrievedMemories).toHaveLength(1);
      expect(modelContext.retrievedMemories[0]?.summary).toBe(virtual.summary);
      const selected = selectSeyeonExactModelPersonalSourcesV1({
        retrievedMemories: modelContext.retrievedMemories,
        sourceCandidates: modelContext.personalRecordProjectionCandidates ?? [],
        maxRetrievedMemories: 1,
      });
      expect(selected.selectedSources).toHaveLength(1);
      source = selected.selectedSources[0] as typeof source;
      expect(source.recordId).toBe(memory);
      expect(source.grantId).toBe(grant);
    }
    const selectionDigest = hash([source]), contextDigest = hash(modelContext ?? { synthetic: turn });
    if (withRecentPin) {
      const recentMessage = { messageId: user, role: 'user' as const, text: userText };
      await run(({ client }) => client.query(`
        select seyeon_private.pin_model_recent_sources_v1(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text
        )`, [subject,thread,turn,attempt,user,JSON.stringify([{
          ...recentMessage,selectedModelMessageDigest:withRecentPin === 'invalid'
            ? 'sha256:v1:' + '0'.repeat(64) : hash(recentMessage),
        }]),hash({
          originalPersonalSources:[source],
          currentUserSource:{...recentMessage,selectedModelMessageDigest:hash(recentMessage)},
          unpinnedRecentSources:[],unpinnedDerivedSources:[],
        })]));
    }
    await run(({ client }) => createSeyeonPositiveS0OwnerDbPortsV1(client).pinBeforeModel({
      subjectId: subject, threadId: thread, turnId: turn, attemptId: attempt,
      currentUserMessageId:user,
      currentUserTextDigest:'sha256:wire-utf8:v1:'+
        createHash('sha256').update(userText,'utf8').digest('hex'),
      originalMemoryId: memory, originalGrantId: grant, recordType: source.recordType,
      schemaVersion: source.schemaVersion, projectorVersion: source.projectorVersion,
      selectedSources: [source], selectedSourcesDigest: selectionDigest,
      projectedMemoryDigest: source.projectedMemoryDigest,
      finalModelContextDigest: contextDigest, expectedOriginalPgDigest: source.rawRecordPgDigest,
    }));
    let assistantText = 'DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK';
    if (modelContext !== undefined) {
      // Explicit local synthetic model: no provider, credential, or paid call.
      // It receives ONLY the DB-read, projected context after durable G1 Pin.
      const { rows: [pin] } = await pool.query(`select
        seyeon_personal_source_pin_jsonb->'positiveProof'->>'finalModelContextDigest' as digest
        from public.chat_turn_attempts where id=$1`, [attempt]);
      expect(pin.digest).toBe(contextDigest);
      assistantText = '기억해요. ' + modelContext.retrievedMemories[0]!.summary;
    }
    const generation = adapt(baseline.slice(generationStart, generationEnd))
      .replaceAll("->'zeroProof'", "->'positiveProof'")
      .replaceAll('DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK', assistantText.replaceAll("'", "''"));
    await pool.query(`BEGIN; set local myeongha.subject_id='${subject}';\n${generation}\nCOMMIT;`);
    const snapshot = {
      schemaVersion: 'seyeon-post-turn-analysis-snapshot-v1', mode: 'OFF',
      turnId: turn, userMessageId: user, assistantMessageId: assistant,
      preparedAt: '2026-10-24T00:00:00.000Z', productionAuthorityRef: 'production:synthetic-test',
      interpretation: {}, envelope: { utterance: assistantText },
      eventAuthorityEvidence: {}, priorEvents: [], relationshipBefore: {}, productionCausalBindings: [],
      identity: { experimentalEventId: uuid(26, n), experimentalEventDedupeKey: 's0-test-' + n,
        productionEventId: 's0-production-' + n, relationshipSyncOutboxEventId: 's0-sync-' + n },
    };
    const commitInput = {
      subjectId: subject, threadId: thread, turnId: turn, attemptId: attempt,
      userMessageId: user, assistantMessageId: assistant, chatOutboxEventId: uuid(22, n),
      postTurnOutboxEventId: uuid(23, n), postTurnSnapshot: snapshot,
      postTurnSnapshotHash: hash(snapshot), selectedSourcesDigest: selectionDigest,
      finalModelContextDigest: contextDigest,
    };
    const commit = () => run(({ client }) => createSeyeonPositiveS0OwnerDbPortsV1(client).commitAfterValidation(commitInput));
    const locked = () => createSeyeonFirstPositiveMemoryLockedReadV1({
      pool: subjectPool, verifiedEvidence: evidence, expectedSubjectId: subject,
      threadId: thread, turnId: turn, attemptId: attempt,
      originalUserMessageId: user, committedAssistantMessageId: assistant,
      postTurnOutboxEventId: uuid(23, n), currentClientTurnId: uuid(30, n),
    });
    const revoke = () => revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool: subjectPool, verifiedEvidence: evidence, memoryItemId: memory, dbCommand: 'private_candidate',
    });
    return { n, auth, subject, thread, turn, attempt, user, assistant, memory, grant, evidence, run, commitInput, commit, locked, revoke, readContext, assistantText, userText };
  }

  async function requestVirtualFirstReply(f: Awaited<ReturnType<typeof prepare>>, revokeBeforeReveal = false) {
    let complete!: () => void;
    const handled = new Promise<void>(resolve => { complete = resolve; });
    const server = createServer((incoming, response) => {
      void handleSeyeonFirstPositiveMemoryDirectNodeHttpV1({
        incoming, response, pool: subjectPool,
        identityEvidenceVerifier: { verifyRequestIdentity: async () => f.evidence },
        runtime: { run: async () => {
          const committed = await f.commit();
          if (revokeBeforeReveal) await f.revoke();
          return {
            subjectId: f.subject,
            threadBinding: { threadId: f.thread, participantCharacterIds: ['seyeon'] },
            execution: {
              disposition: 'executed', committedTurn: committed,
              receivedTurn: { turnId: f.turn, userMessageId: f.user,
                threadCharacterId: uuid(15, f.n), turnState: 'received', replayed: false,
                committedTurn: null, userText: f.userText },
              attempt: { attemptId: f.attempt, replayed: false },
              postTurnAnalysis: { status: 'deferred', outboxEventId: uuid(23, f.n) },
            },
          } as unknown as RunProductionSeyeonChatResultV1;
        } },
      }).finally(complete);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${f.thread}/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTurnId: uuid(30, f.n), text: f.userText }),
      });
      const body = await response.text();
      await handled;
      return { status: response.status, cache: response.headers.get('Cache-Control'), body };
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  it('denies G2 Commit for a legacy Memory-only Pin with no current User certificate', async () => {
    const f=await prepare(15,undefined,false);
    await expect(f.commit()).rejects.toMatchObject({
      constraint:'seyeon_positive_g2_recent_source_pin_required',
    });
    const {rows:[attempt]}=await pool.query(`select state,
      seyeon_personal_source_pin_jsonb as personal,
      seyeon_recent_source_pin_jsonb as recent
      from public.chat_turn_attempts where id=$1`,[f.attempt]);
    expect(attempt.state).toBe('validated');
    expect(attempt.personal.positiveProof).toBeDefined();
    expect(attempt.recent).toBeNull();
    const {rows:[count]}=await pool.query(`select count(*)::int as n
      from public.conversation_messages where turn_id=$1 and sender_type='character'`,[f.turn]);
    expect(count.n).toBe(0);
  });

  it('rejects a forged model-message digest before saving any G1 certificate or invoking a model', async () => {
    await expect(prepare(14, undefined, 'invalid')).rejects.toMatchObject({
      constraint: 'seyeon_g1_recent_model_digest_mismatch',
    });
    const {rows:[pin]}=await pool.query(`select
      seyeon_recent_source_pin_jsonb as recent,
      seyeon_personal_source_pin_jsonb as personal,
      state from public.chat_turn_attempts where id=$1`,[uuid(17,14)]);
    expect(pin).toMatchObject({recent:null,personal:null,state:'running'});
    const {rows:[count]}=await pool.query(`select count(*)::int as n
      from public.conversation_messages
      where turn_id=$1 and sender_type='character'`,[uuid(16,14)]);
    expect(count.n).toBe(0);
  });

  it('checks the exact pinned User DB original before first Reveal without permitting a replay', async () => {
    const f = await prepare(13, undefined, true);
    const originalPin = await pool.query(`select seyeon_recent_source_pin_jsonb as pin
      from public.chat_turn_attempts where id=$1`, [f.attempt]);
    expect(originalPin.rows[0].pin.sources).toHaveLength(1);
    expect(originalPin.rows[0].pin.sources[0].messageId).toBe(f.user);
    const reply = await requestVirtualFirstReply(f);
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(f.assistantText);
    await f.locked()({ signal: new AbortController().signal,
      deliver: async text => { expect(text).toBeNull(); },
    });
  });

  it('persists exact G1, commits actual v2 plus two Outboxes, consumes first Reveal once, and keeps private acceptance at zero grants', async () => {
    const f = await prepare(1);
    let complete!: () => void;
    const handled = new Promise<void>(resolve => { complete = resolve; });
    const server = createServer((incoming, response) => {
      void handleSeyeonFirstPositiveMemoryDirectNodeHttpV1({
        incoming, response, pool: subjectPool,
        identityEvidenceVerifier: { verifyRequestIdentity: async () => f.evidence },
        runtime: { run: async () => {
          const committed = await f.commit();
          return {
            subjectId: f.subject,
            threadBinding: { threadId: f.thread, participantCharacterIds: ['seyeon'] },
            execution: {
              disposition: 'executed', committedTurn: committed,
              receivedTurn: { turnId: f.turn, userMessageId: f.user,
                threadCharacterId: uuid(15, f.n), turnState: 'received', replayed: false,
                committedTurn: null, userText: 'Synthetic first hello' },
              attempt: { attemptId: f.attempt, replayed: false },
              postTurnAnalysis: { status: 'deferred', outboxEventId: uuid(23, 1) },
            },
          } as unknown as RunProductionSeyeonChatResultV1;
        } },
      }).finally(complete);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${f.thread}/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTurnId: uuid(30, 1), text: 'Synthetic first hello' }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect((await response.json()).data.assistantText).toBe('DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK');
      await handled;
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    await f.locked()({ signal: new AbortController().signal,
      deliver: async body => { expect(body).toBeNull(); },
    });
    const proposal = uuid(27, 1), newMemory = uuid(28, 1);
    await pool.query(`insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,
      record_type,schema_version,proposed_value_jsonb,source_turn_id,source_message_id,
      proposal_dedupe_key,status,created_at)
      values($1,$2,'seyeon','memory','conversation_recall','v1','{"summary":"private approved"}',$3,$4,
      's0-private-proposal','pending',clock_timestamp())`,
    [proposal, f.subject, f.turn, f.user]);
    const accepted = await f.run(({ client }) => acceptSeyeonPrivateConversationRecallProposalV1(client, {
      subjectId: f.subject, proposalId: proposal, memoryItemId: newMemory, grantChoice: { mode: 'private' },
    }));
    expect(accepted).toEqual({ memoryItemId: newMemory, grantCount: 0, replayed: false });
    const { rows: [count] } = await pool.query('select count(*)::int as n from public.record_access_grants where memory_item_id=$1', [newMemory]);
    expect(count.n).toBe(0);
    // A private receipt must never silently imply character permission.
    // Only a distinct, explicit verified Member choice may create a Grant.
    const approvedGrantId=uuid(29,1);
    const issued=await f.run(({client})=>createSeyeonOwnedOriginalGrantV1(client,{
      subjectId:f.subject,memoryItemId:newMemory,grantId:approvedGrantId,
      grantChoice:{mode:'character_only',characterId:'seyeon'},
    }));
    expect(issued).toEqual({
      memoryItemId:newMemory,grantId:approvedGrantId,characterId:'seyeon',replayed:false,
    });
    const {rows:[g]}=await pool.query(`select count(*)::int as n
      from public.record_access_grants where memory_item_id=$1
        and grantee_character_id='seyeon' and grant_reason='user_choice'
        and revoked_at is null`,[newMemory]);
    expect(g.n).toBe(1);
    await expect(f.run(({client})=>createSeyeonOwnedOriginalGrantV1(client,{
      subjectId:f.subject,memoryItemId:newMemory,grantId:uuid(29,99),
      grantChoice:{mode:'character_only',characterId:'seyeon'},
    }))).rejects.toMatchObject({constraint:'seyeon_owned_grant_active_exists'});
    await expect(f.run(({client})=>createSeyeonOwnedOriginalGrantV1(client,{
      subjectId:f.subject,memoryItemId:f.memory,grantId:uuid(29,98),
      grantChoice:{mode:'character_only',characterId:'seyeon'},
    }))).rejects.toMatchObject({constraint:'seyeon_owned_grant_accepted_source_required'});
    const invalidProposal = uuid(27, 99);
    await pool.query(`insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,
      record_type,schema_version,proposed_value_jsonb,source_turn_id,source_message_id,
      proposal_dedupe_key,status,created_at)
      values($1,$2,'seyeon','memory','conversation_recall','v1',$3::jsonb,$4,$5,
        's0-private-invalid-unicode','pending',clock_timestamp())`,
    [invalidProposal, f.subject, JSON.stringify({ summary: '😀'.repeat(2001) }), f.turn, f.user]);
    await expect(f.run(({ client }) => acceptSeyeonPrivateConversationRecallProposalV1(client, {
      subjectId: f.subject, proposalId: invalidProposal, memoryItemId: uuid(28, 99), grantChoice: { mode: 'private' },
    }))).rejects.toMatchObject({ constraint: 'seyeon_private_memory_accept_summary_invalid' });
  });

  it('DB Planner Character source admits atomic Member Memory+Grant, manual UserMessage denied',async()=>{
    // Dedicated S0 Planner fixture namespace (201-202); history-presence uses 13.
    const f=await prepare(201);
    await f.commit();
    const id=uuid(27,201);
    const producerInput={
      canonicalMemberSubjectId:f.subject,proposalId:id,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자가 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    };
    const created=await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,producerInput));
    expect(created).toEqual({proposalId:id,proposalState:'pending',replayed:false});
    const replay=await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,producerInput));
    expect(replay).toEqual({proposalId:id,proposalState:'pending',replayed:true});
    const {rows:[beforeConsent]}=await pool.query(
      'select count(*)::int as n from public.memory_items where subject_id=$1 and source_turn_id=$2',
      [f.subject,f.turn]);
    expect(beforeConsent.n).toBe(0);
    const receipt=await f.run(async({client})=>{
      const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:f.subject,proposalId:id,
      });
      expect(source.currentEligibleCharacterIds).toEqual(['seyeon']);
      expect(source.candidate.sourceAuthority).toBe('db_verified_dialogue_planner');
      const plan=planSeyeonPlannerMemoryDecisionV1({
        candidate:source.candidate,canonicalMemberSubjectId:f.subject,
        choice:'character_only',currentEligibleCharacterIds:source.currentEligibleCharacterIds,
      });
      return commitSeyeonSingleCharacterPlannerGrantDecisionV1({
        client,canonicalMemberSubjectId:f.subject,plan,
      });
    });
    expect(receipt).toEqual({proposalId:id,decision:'character_only',
      status:'resolved',persisted:true,grantCount:1,payloadPurged:false});
    const {rows:[record]}=await pool.query(`select p.status,m.content_jsonb as body,
      (select count(*)::int from public.record_access_grants g
        where g.memory_item_id=m.id and g.grantee_character_id='seyeon') as grants
      from public.memory_proposals p join public.memory_items m
        on m.id=p.accepted_memory_item_id where p.id=$1`,[id]);
    expect(record).toEqual({status:'accepted',body:{summary:'사용자가 인사를 했다'},grants:1});
    // A completed decision cannot recreate a pending browser offer on replay.
    // Re-approval or later withdrawal must never resurrect the old proposal.
    expect(await f.run(({client})=>inspectSeyeonPlannerDisplayCandidateS0V1({
      client,canonicalMemberSubjectId:f.subject,
      threadId:f.thread,assistantMessageId:f.assistant,
      approvedInternalS0Inspection:()=>true,
    }))).toBeNull();
    await expect(f.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
      client,canonicalMemberSubjectId:f.subject,proposalId:id,
    }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});

    const other=await prepare(202);
    await other.commit();
    const manual=uuid(27,202);
    await expect(other.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:other.subject,proposalId:manual,turnId:other.turn,
      assistantMessageId:other.user,userMessageId:other.user,
      candidate:{summary:'사용자가 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }))).rejects.toThrow();
    await expect(other.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:other.subject,proposalId:manual,turnId:other.turn,
      assistantMessageId:other.assistant,userMessageId:other.user,
      candidate:{summary:'근거 없는 사용자 정보',userEvidenceQuote:'user did not say this'},
    }))).rejects.toThrow();
    const {rows:[noManual]}=await pool.query(
      'select count(*)::int as n from public.memory_proposals where id=$1',[manual]);
    expect(noManual.n).toBe(0);

    // A public Proposal row bearing the Planner dedupe label is not proof
    // that the Owner's actual producer created it.
    await pool.query(`insert into public.memory_proposals(
      id,subject_id,character_id,proposal_kind,record_type,schema_version,
      proposed_value_jsonb,source_turn_id,source_message_id,
      proposal_dedupe_key,status,created_at)
      values($1,$2,'seyeon','memory','conversation_recall','v1',
        '{"summary":"forged assistant proposal"}',$3,$4,
        'seyeon-dialogue-planner:v1','pending',clock_timestamp())`,
      [manual,other.subject,other.turn,other.assistant]);
    await expect(other.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
      client,canonicalMemberSubjectId:other.subject,proposalId:manual,
    }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});
    const {rows:[ownerEvidence]}=await pool.query(
      'select count(*)::int as n from seyeon_private.planner_memory_proposal_sources_v1 where proposal_id=$1',
      [manual]);
    expect(ownerEvidence.n).toBe(0);
  });

  it('serializes two independent Member decisions: discard prevents concurrent durable consent',async()=>{
    const f=await prepare(209);
    await f.commit();
    const proposalId=uuid(27,209);
    await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }));

    let sourceLocked!:()=>void,release!:()=>void;
    const locked=new Promise<void>(resolve=>{sourceLocked=resolve;});
    const proceed=new Promise<void>(resolve=>{release=resolve;});
    const resolveChoice=(choice:'discard'|'character_only')=>f.run(async({client})=>{
      const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:f.subject,proposalId,
      });
      if(choice==='discard'){sourceLocked();await proceed;}
      const plan=planSeyeonPlannerMemoryDecisionV1({
        candidate:source.candidate,canonicalMemberSubjectId:f.subject,choice,
        currentEligibleCharacterIds:source.currentEligibleCharacterIds,
      });
      return commitSeyeonPlannerMemoryDecisionS0V1({
        client,canonicalMemberSubjectId:f.subject,plan,
      });
    });
    const first=resolveChoice('discard');
    await locked;
    const second=resolveChoice('character_only')
      .then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));

    let waited=false;
    for(let i=0;i<100;i++){
      const {rows:[waiting]}=await pool.query(`select exists(
        select 1 from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and pid<>pg_backend_pid()) as waiting`);
      if(waiting.waiting===true){waited=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    try{expect(waited).toBe(true);}
    finally{release();}
    expect(await first).toMatchObject({
      proposalId,decision:'discard',status:'resolved',
      persisted:false,grantCount:0,payloadPurged:true,
    });
    const losing=await second;
    expect(losing.ok).toBe(false);
    if(!losing.ok)expect(losing.error).toMatchObject({
      code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE',
    });
    const {rows:[state]}=await pool.query(`select p.status,p.proposed_value_jsonb as payload,
      (select count(*)::int from public.memory_items m where m.subject_id=p.subject_id
        and m.source_turn_id=p.source_turn_id) as memories,
      (select count(*)::int from public.record_access_grants g
        join public.memory_items m on m.id=g.memory_item_id
        where m.subject_id=p.subject_id and m.source_turn_id=p.source_turn_id) as grants
      from public.memory_proposals p where p.id=$1`,[proposalId]);
    expect(state).toEqual({status:'rejected',payload:{},memories:0,grants:0});
    expect(await f.run(({client})=>inspectSeyeonPlannerDisplayCandidateS0V1({
      client,canonicalMemberSubjectId:f.subject,
      threadId:f.thread,assistantMessageId:f.assistant,
      approvedInternalS0Inspection:()=>true,
    }))).toBeNull();
  });


  it('UC-06 G3 S0 sends only current pending proposal via a locked real Node HTTP response',async()=>{
    const f=await prepare(211);
    await f.commit();
    const proposalId=uuid(27,211);
    await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }));

    const send=async(evidence:typeof f.evidence,threadId=f.thread,
      assistantId=f.assistant,authorized=true)=>{
      let resolveOutcome!:(outcome:string)=>void;
      const complete=new Promise<string>(resolve=>{resolveOutcome=resolve;});
      const server=createServer((incoming,response)=>{
        void handleSeyeonPendingPlannerNodeHttpS0V1({
          incoming,response,pool:subjectPool,requestId:'s0-proposal-211',
          identityEvidenceVerifier:{verifyRequestIdentity:async(request)=>
            request.headers.get('authorization')==='Bearer synthetic-member'
              ? evidence : null},
        }).then(resolveOutcome,()=>resolveOutcome('error'));
      });
      await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
      try{
        const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${threadId}/planner-proposals/${assistantId}`;
        const response=await fetch(url,{headers:authorized
          ?{Authorization:'Bearer synthetic-member'}:{}});
        const raw=await response.text();
        const outcome=await complete;
        return {status:response.status,cache:response.headers.get('Cache-Control'),
          payload:JSON.parse(raw) as Record<string,unknown>,outcome,raw};
      }finally{
        server.closeAllConnections();
        await new Promise<void>(resolve=>server.close(()=>resolve()));
      }
    };

    const visible=await send(f.evidence);
    expect(visible.status).toBe(200);
    expect(visible.cache).toContain('no-store');
    expect(visible.outcome).toBe('proposal_sent');
    expect(visible.payload).toEqual({ok:true,
      data:{threadId:f.thread,assistantMessageId:f.assistant,
        memoryProposal:{sourceAuthority:'server_dialogue_planner',
          characterId:'seyeon',proposalId,proposalKind:'memory',
          proposalState:'pending',summary:'사용자는 인사를 했다'}},
      meta:{apiContractVersion:'v0.9',requestId:'s0-proposal-211'},
    });
    expect(visible.raw).not.toContain('Synthetic first hello');

    const unauthenticated=await send(f.evidence,f.thread,f.assistant,false);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.outcome).toBe('preflight_denied');
    expect(unauthenticated.raw).not.toContain('사용자는 인사를 했다');

    const other=await prepare(212);
    await other.commit();
    const wrongMember=await send(other.evidence);
    expect(wrongMember.status).toBe(503);
    expect(wrongMember.outcome).toBe('proposal_withheld');
    expect(wrongMember.raw).not.toContain('사용자는 인사를 했다');

    const wrongMessage=await send(f.evidence,f.thread,f.user);
    expect(wrongMessage.status).toBe(503);
    expect(wrongMessage.raw).not.toContain('사용자는 인사를 했다');

    await f.run(async({client})=>{
      const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:f.subject,proposalId,
      });
      const plan=planSeyeonPlannerMemoryDecisionV1({
        candidate:source.candidate,canonicalMemberSubjectId:f.subject,
        currentEligibleCharacterIds:source.currentEligibleCharacterIds,choice:'discard',
      });
      return commitSeyeonPlannerMemoryDecisionS0V1({
        client,canonicalMemberSubjectId:f.subject,plan,
      });
    });
    const afterDiscard=await send(f.evidence);
    expect(afterDiscard.status).toBe(503);
    expect(afterDiscard.outcome).toBe('proposal_withheld');
    expect(afterDiscard.raw).not.toContain('사용자는 인사를 했다');
  });

  it('UC-06/07 real Node GET -> explicit POST discard -> replay denied on the same Member',async()=>{
    const f=await prepare(213);
    await f.commit();
    const proposalId=uuid(27,213);
    await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }));
    const identityEvidenceVerifier={
      verifyRequestIdentity:async(request:Request)=>
        request.headers.get('authorization')==='Bearer synthetic-member'
          ?f.evidence:null,
    };
    const server=createServer((incoming,response)=>{
      const input={incoming,response,pool:subjectPool,identityEvidenceVerifier,
        requestId:'planner-node-flow-213'};
      if(incoming.method==='POST'){
        void handleSeyeonPlannerDecisionNodeHttpS0V1(input);
      }else{
        void handleSeyeonPendingPlannerNodeHttpS0V1(input);
      }
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const getUrl=origin+'/api/chat/'+f.thread+'/planner-proposals/'+f.assistant;
    const postUrl=origin+'/api/memory/proposals/'+proposalId+'/decision';
    try{
      const visible=await fetch(getUrl,{headers:{Authorization:'Bearer synthetic-member'}});
      expect(visible.status).toBe(200);
      const offered=await visible.json();
      expect(offered.data.memoryProposal).toMatchObject({
        proposalId,sourceAuthority:'server_dialogue_planner',proposalState:'pending',
        summary:'사용자는 인사를 했다',
      });
      const denied=await fetch(postUrl,{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({choice:{mode:'discard'}})});
      expect(denied.status).toBe(401);
      const confirmed=await fetch(postUrl,{method:'POST',
        headers:{Authorization:'Bearer synthetic-member','Content-Type':'application/json'},
        body:JSON.stringify({choice:{mode:'discard'}})});
      expect(confirmed.status).toBe(200);
      expect(confirmed.headers.get('Cache-Control')).toBe('no-store');
      expect((await confirmed.json()).data).toEqual({
        proposalId,decision:'discard',status:'resolved',persisted:false,grantCount:0,
      });
      const again=await fetch(getUrl,{headers:{Authorization:'Bearer synthetic-member'}});
      expect(again.status).toBe(503);
      const withheld=await again.text();
      expect(withheld).not.toContain('사용자는 인사를 했다');
      expect(withheld).not.toContain('Synthetic first hello');
      const replay=await fetch(postUrl,{method:'POST',
        headers:{Authorization:'Bearer synthetic-member','Content-Type':'application/json'},
        body:JSON.stringify({choice:{mode:'discard'}})});
      expect(replay.status).toBe(503);
      const {rows:[db]}=await pool.query(`select status,
        proposed_value_jsonb as payload,
        (select count(*)::int from public.memory_items m
          where m.source_turn_id=memory_proposals.source_turn_id
          and m.subject_id=memory_proposals.subject_id) as memories
        from public.memory_proposals where id=$1`,[proposalId]);
      expect(db).toEqual({status:'rejected',payload:{},memories:0});
    }finally{
      server.closeAllConnections();
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });

  it('UC-07 real Node Member POST creates exactly one accepted Memory and original Se-yeon Grant',async()=>{
    const f=await prepare(215);
    await f.commit();
    const proposalId=uuid(27,215);
    await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }));
    const identityEvidenceVerifier={
      verifyRequestIdentity:async()=>f.evidence,
    };
    const server=createServer((incoming,response)=>{
      const args={incoming,response,pool:subjectPool,identityEvidenceVerifier,
        requestId:'node-member-accept-215'};
      if(incoming.method==='POST'){
        void handleSeyeonPlannerDecisionNodeHttpS0V1(args);
      }else{
        void handleSeyeonPendingPlannerNodeHttpS0V1(args);
      }
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try{
      const response=await fetch(
        origin+'/api/memory/proposals/'+proposalId+'/decision',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({choice:{mode:'character_only',characterId:'seyeon'}}),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({
        proposalId,decision:'character_only',status:'resolved',
        persisted:true,grantCount:1,
      });
      const {rows:[state]}=await pool.query(`select p.status,
        (select count(*)::int from public.memory_items m
          where m.id=p.accepted_memory_item_id) as memories,
        (select count(*)::int from public.record_access_grants g
          where g.memory_item_id=p.accepted_memory_item_id
            and g.grantee_character_id='seyeon') as grants
        from public.memory_proposals p where p.id=$1`,[proposalId]);
      expect(state).toEqual({status:'accepted',memories:1,grants:1});
      const replay=await fetch(origin+'/api/chat/'+f.thread+
        '/planner-proposals/'+f.assistant);
      expect(replay.status).toBe(503);
      const body=await replay.text();
      expect(body).not.toContain('사용자는 인사를 했다');
    }finally{
      server.closeAllConnections();
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });

  it('UC-07 session-only and discard resolve pending without long-term Memory or Grants',async()=>{
    for(const [n,choice,status] of [
      [203,'session_only','expired'],
      [204,'discard','rejected'],
    ] as const){
      const f=await prepare(n);
      await f.commit();
      const proposalId=uuid(27,n);
      await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
        canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
        assistantMessageId:f.assistant,userMessageId:f.user,
        candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
      }));
      const receipt=await f.run(async({client})=>{
        const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
          client,canonicalMemberSubjectId:f.subject,proposalId,
        });
        const plan=planSeyeonPlannerMemoryDecisionV1({
          candidate:source.candidate,canonicalMemberSubjectId:f.subject,
          currentEligibleCharacterIds:source.currentEligibleCharacterIds,
          choice,
        });
        return commitSeyeonPlannerMemoryDecisionS0V1({
          client,canonicalMemberSubjectId:f.subject,plan,
        });
      });
      expect(receipt).toEqual({proposalId,decision:choice,status:'resolved',
        persisted:false,grantCount:0,payloadPurged:true});
      const {rows:[row]}=await pool.query(`select p.status,p.proposed_value_jsonb as payload,
        (select count(*)::int from public.memory_items m where m.subject_id=p.subject_id
          and m.source_turn_id=p.source_turn_id) as memories,
        (select count(*)::int from public.record_access_grants g
          join public.memory_items m on m.id=g.memory_item_id
          where m.subject_id=p.subject_id and m.source_turn_id=p.source_turn_id) as grants
        from public.memory_proposals p where p.id=$1`,[proposalId]);
      expect(row).toEqual({status,payload:{},memories:0,grants:0});
      await expect(f.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:f.subject,proposalId,
      }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});
    }
  });

  it('SRC-05 bounded pending Planner expiry erases only overdue DB-owned proposals',async()=>{
    const overdue=await prepare(205);
    await overdue.commit();
    const overdueId=uuid(27,205);
    const current=await prepare(206);
    await current.commit();
    const currentId=uuid(27,206);
    const rejected=await prepare(207);
    await rejected.commit();
    const rejectedId=uuid(27,207);

    for(const [f,proposalId] of [
      [overdue,overdueId],[current,currentId],[rejected,rejectedId],
    ] as const){
      await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
        canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
        assistantMessageId:f.assistant,userMessageId:f.user,
        candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
      }));
    }
    const rejectedReceipt=await rejected.run(async({client})=>{
      const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:rejected.subject,proposalId:rejectedId,
      });
      const plan=planSeyeonPlannerMemoryDecisionV1({
        candidate:source.candidate,canonicalMemberSubjectId:rejected.subject,
        currentEligibleCharacterIds:source.currentEligibleCharacterIds,
        choice:'discard',
      });
      return commitSeyeonPlannerMemoryDecisionS0V1({
        client,canonicalMemberSubjectId:rejected.subject,plan,
      });
    });
    expect(rejectedReceipt.payloadPurged).toBe(true);

    await pool.query(`update public.memory_proposals
      set created_at=clock_timestamp()-interval '3 days'
      where id in ($1,$2)`,[overdueId,rejectedId]);
    const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
    const {rows:[acl]}=await pool.query(`select has_function_privilege(
      'myeongha_api_executor',
      'seyeon_private.cmd_expire_pending_planner_memory_batch_v1(timestamptz,integer)',
      'EXECUTE') as allowed`);
    expect(acl.allowed).toBe(false);

    const {rows:expired}=await pool.query(`select proposal_id::text as id,
      subject_id::text as subject, payload_purged as purged
      from seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
        $1::timestamptz,$2::integer)`,[cutoff,1]);
    expect(expired).toEqual([{
      id:overdueId,subject:overdue.subject,purged:true,
    }]);
    const {rows:records}=await pool.query(`select id::text as id,status,
      proposed_value_jsonb as payload from public.memory_proposals
      where id=any($1::uuid[]) order by id`,
      [[overdueId,currentId,rejectedId]]);
    const status=new Map(records.map(x=>[x.id,{status:x.status,payload:x.payload}]));
    expect(status.get(overdueId)).toEqual({status:'expired',payload:{}});
    expect(status.get(currentId)).toEqual({
      status:'pending',payload:{summary:'사용자는 인사를 했다'},
    });
    expect(status.get(rejectedId)).toEqual({status:'rejected',payload:{}});
    const {rows:replayed}=await pool.query(`select proposal_id from
      seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
        $1::timestamptz,$2::integer)`,[cutoff,1]);
    expect(replayed).toHaveLength(0);
    await expect(overdue.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
      client,canonicalMemberSubjectId:overdue.subject,proposalId:overdueId,
    }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});
    await expect(pool.query(`select * from
      seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
        clock_timestamp()+interval '1 day',1)`))
      .rejects.toMatchObject({constraint:'seyeon_planner_expiry_policy_required'});
    await expect(pool.query(`select * from
      seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
        clock_timestamp()-interval '1 day',101)`))
      .rejects.toMatchObject({constraint:'seyeon_planner_expiry_policy_required'});
  });

  it('S0 pending Planner display candidate is owner-bound, never a public G3 Reveal',async()=>{
    const f=await prepare(208);
    await f.commit();
    const proposalId=uuid(27,208);
    await f.run(({client})=>createPendingSeyeonPlannerMemoryProposalV1(client,{
      canonicalMemberSubjectId:f.subject,proposalId,turnId:f.turn,
      assistantMessageId:f.assistant,userMessageId:f.user,
      candidate:{summary:'사용자는 인사를 했다',userEvidenceQuote:'Synthetic first hello'},
    }));

    const inspect=()=>f.run(({client})=>inspectSeyeonPlannerDisplayCandidateS0V1({
      client,canonicalMemberSubjectId:f.subject,
      threadId:f.thread,assistantMessageId:f.assistant,
      approvedInternalS0Inspection:()=>true,
    }));
    expect(await inspect()).toEqual({
      sourceAuthority:'db_owner_planner_inspection_only',
      disclosureAuthorized:false,subjectId:f.subject,threadId:f.thread,
      assistantMessageId:f.assistant,proposalId,proposalKind:'memory',
      summary:'사용자는 인사를 했다',
    });
    expect(await f.run(({client})=>inspectSeyeonPlannerDisplayCandidateS0V1({
      client,canonicalMemberSubjectId:f.subject,
      threadId:f.thread,assistantMessageId:f.user,
      approvedInternalS0Inspection:()=>true,
    }))).toBeNull();
    await f.run(async({client})=>{
      const source=await readSeyeonPendingPlannerMemoryDecisionSourceV1({
        client,canonicalMemberSubjectId:f.subject,proposalId,
      });
      const plan=planSeyeonPlannerMemoryDecisionV1({
        candidate:source.candidate,canonicalMemberSubjectId:f.subject,
        currentEligibleCharacterIds:source.currentEligibleCharacterIds,
        choice:'discard',
      });
      await commitSeyeonPlannerMemoryDecisionS0V1({
        client,canonicalMemberSubjectId:f.subject,plan,
      });
    });
    expect(await inspect()).toBeNull();
  });

  it('rejects a revoked original Grant at atomic Commit even after a fresh replacement Grant', async () => {
    const f = await prepare(2);
    await f.revoke();
    await pool.query(`insert into public.record_access_grants(id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at)
      values($1,$2,$3,'seyeon','user_choice',clock_timestamp())`, [uuid(29, 2), f.subject, f.memory]);
    await expect(f.commit()).rejects.toThrow();
    const { rows: [messages] } = await pool.query("select count(*)::int as n from public.conversation_messages where turn_id=$1 and sender_type='character'", [f.turn]);
    expect(messages.n).toBe(0);
  });

  it('retains the actual legacy v2 original-user check and rolls back its assistant and Outboxes', async () => {
    const f = await prepare(5);
    const snapshot = { ...f.commitInput.postTurnSnapshot, userMessageId: uuid(18, 999) };
    await expect(f.run(({ client }) => client.query(`select * from public.cmd_commit_seyeon_chat_turn_runtime_v2(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text)`, [
      f.subject, f.thread, f.turn, f.attempt, f.assistant, uuid(22, 5), uuid(23, 5),
      JSON.stringify(snapshot), hash(snapshot),
    ]))).rejects.toMatchObject({ constraint: 'seyeon_post_turn_user_message_mismatch' });
    const { rows: [count] } = await pool.query("select count(*)::int as n from public.conversation_messages where turn_id=$1 and sender_type='character'", [f.turn]);
    expect(count.n).toBe(0);
  });

  it('serializes original Grant revoke behind locked delivery until the same transaction commits', async () => {
    const f = await prepare(3);
    await f.commit();
    let revoke: ReturnType<typeof f.revoke> | undefined;
    let done = false;
    await f.locked()({ signal: new AbortController().signal, deliver: async body => {
      expect(body).toBe('DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK');
      revoke = f.revoke().then(value => { done = true; return value; });
      // Prove a real second backend is waiting on a DB lock, rather than a timer.
      for (let i = 0; i < 100; i++) {
        const { rows: [waiting] } = await pool.query(`select exists(select 1 from pg_stat_activity
          where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()) as yes`);
        if (waiting.yes) break;
        if (i === 99) throw Error('Independent revoke session never waited on the original lock');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(done).toBe(false);
    } });
    await revoke;
    expect(done).toBe(true);
    await f.locked()({ signal: new AbortController().signal, deliver: async body => { expect(body).toBeNull(); } });
  });

  it('rolls back first-send consumption on aborted delivery and permits a fresh current-rights read', async () => {
    const f = await prepare(4);
    await f.commit();
    await expect(f.locked()({ signal: new AbortController().signal,
      deliver: async () => { throw Error('synthetic disconnected socket'); },
    })).rejects.toThrow('synthetic disconnected');
    await f.locked()({ signal: new AbortController().signal, deliver: async body => {
      expect(body).toBe('DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK');
    } });
  });

  it('reads a virtual Korean memory through the real context projector, pins before a synthetic model, and sends its DB answer over HTTP', async () => {
    const summary = '나는 매주 토요일 아침에 한강을 산책한다.';
    const f = await prepare(6, { summary });
    const response = await requestVirtualFirstReply(f);
    expect(response.status).toBe(200);
    expect(response.cache).toBe('no-store');
    expect(JSON.parse(response.body).data.assistantText).toBe('기억해요. ' + summary);
    const { rows: [stored] } = await pool.query(`select body_text from public.conversation_messages where id=$1`, [f.assistant]);
    expect(stored.body_text).toBe(f.assistantText);
    await f.revoke();
    await expect(f.readContext()).rejects.toMatchObject({
      constraint: 'seyeon_source_lock_original_grant_required',
    });
    await f.locked()({ signal: new AbortController().signal, deliver: async body => { expect(body).toBeNull(); } });
    console.info('VIRTUAL_MEMORY_E2E ' + JSON.stringify({
      case: 'approved-memory-first-reply', memory: summary,
      model: 'local-synthetic-no-provider', question: f.userText, reply: f.assistantText,
      httpStatus: response.status, pinBeforeModel: true,
      originalGrantRevoked: true, personalRecordsAfterRevoke: 0,
    }));
  });

  it('withholds the actual HTTP body when the virtual memory is revoked after generation and Commit but before first Reveal', async () => {
    const summary = '나는 매주 토요일 아침에 한강을 산책한다.';
    const f = await prepare(7, { summary });
    const response = await requestVirtualFirstReply(f, true);
    expect(response.status).toBe(503);
    expect(response.cache).toBe('no-store');
    expect(response.body).not.toContain(summary);
    expect(response.body).not.toContain(f.assistantText);
    await expect(f.readContext()).rejects.toMatchObject({
      constraint: 'seyeon_source_lock_original_grant_required',
    });
    console.info('VIRTUAL_MEMORY_E2E ' + JSON.stringify({
      case: 'revoke-before-first-reveal', model: 'local-synthetic-no-provider',
      httpStatus: response.status, privateBodyExposed: false,
      personalRecordsAfterRevoke: 0,
    }));
  });

  async function fetchReply(f:Awaited<ReturnType<typeof prepare>>){
    return handleSeyeonFirstPositiveMemoryFetchV1({
      request:new Request(`https://receipt.test/api/chat/${f.thread}/turns`,{method:'POST',
        headers:{'Content-Type':'application/json','x-myeongha-delivery-receipt':'v1'},
        body:JSON.stringify({clientTurnId:uuid(30,f.n),text:f.userText})}),
      requestId:'receipt-e2e',serverTime:new Date().toISOString(),pool:subjectPool,
      identityEvidenceVerifier:{verifyRequestIdentity:async()=>f.evidence},
      runtime:{run:async()=>({subjectId:f.subject,
        threadBinding:{threadId:f.thread,participantCharacterIds:['seyeon']},
        execution:{disposition:'executed',committedTurn:await f.commit(),
          receivedTurn:{turnId:f.turn,userMessageId:f.user,threadCharacterId:uuid(15,f.n),
            turnState:'received',replayed:false,committedTurn:null,userText:f.userText},
          attempt:{attemptId:f.attempt,replayed:false},
          postTurnAnalysis:{status:'deferred',outboxEventId:uuid(23,f.n)}}}) as unknown as RunProductionSeyeonChatResultV1},
    });
  }
  const requestRevoke=(f:Awaited<ReturnType<typeof prepare>>)=>f.run(async({client})=>{
    const r=await client.query<{result:Record<string,unknown>}>(`select
      seyeon_private.cmd_request_seyeon_memory_revoke_v1($1::uuid,$2::uuid) as result`,[f.subject,f.memory]);
    return r.rows[0]!.result;
  });
  const readOwnerLifecycle=async(f:Awaited<ReturnType<typeof prepare>>)=>{
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1({
      request:new Request(`https://receipt.test/api/memories/${f.memory}/grants/seyeon`),
      requestId:'s0-lifecycle',serverTime:new Date().toISOString(),
      pool:subjectPool,
      identityEvidenceVerifier:{verifyRequestIdentity:async()=>f.evidence},
    });
    expect(response.status).toBe(200);
    return (await response.json()).data as {
      grantState:string;currentlyGranted:boolean;grantedAt:string|null;
    };
  };
  const ack=(attempt:string,proof:string)=>handleSeyeonPositiveReplyReceiptV1({
    request:new Request(`https://receipt.test/api/chat/delivery-receipts/${attempt}`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({proof})}),
    requestId:'receipt-ack',pool:subjectPool,
  });

  it('holds withdrawal before an unread Fetch response, blocks legacy invalidation, then completes only after its exact receipt',async()=>{
    const f=await prepare(8);
    const response=await fetchReply(f);
    expect(response.status).toBe(200);
    // The Fetch body is NOT consumed: this is the former R -> V -> S gap.
    expect(response.bodyUsed).toBe(false);
    expect(await readOwnerLifecycle(f)).toMatchObject({grantState:'active',currentlyGranted:true});
    expect(await requestRevoke(f)).toMatchObject({status:'pending',newUseBlocked:true});
    expect(await readOwnerLifecycle(f)).toMatchObject({
      grantState:'withdrawal_pending',currentlyGranted:false,grantedAt:null,
    });
    const {rows:[g]}=await pool.query(`select revoked_at,seyeon_revoke_requested_at
      from public.record_access_grants where id=$1`,[f.grant]);
    expect(g.revoked_at).toBeNull();expect(g.seyeon_revoke_requested_at).not.toBeNull();
    await expect(f.readContext()).rejects.toMatchObject({
      constraint: 'seyeon_source_lock_original_grant_required',
    });
    await expect(f.revoke()).rejects.toMatchObject({constraint:'seyeon_positive_delivery_receipt_pending'});
    await expect(pool.query('update public.memory_items set revoked_at=clock_timestamp() where id=$1',[f.memory]))
      .rejects.toMatchObject({constraint:'seyeon_positive_delivery_receipt_pending'});
    await expect(f.run(({client})=>client.query(`select seyeon_private.lock_original_memory_grant_v1(
      $1::uuid,$2::uuid,$3::uuid)`,[f.subject,f.memory,f.grant])))
      .rejects.toThrow(); // API cannot call this private authority directly.
    const payload=await response.json();
    expect(payload.data.assistantText).toBe(f.assistantText);
    const receipt=payload.data.deliveryReceipt as {attemptId:string;challenge:string};
    expect((await ack(uuid(17,999),receiptProof(payload.data.assistantText,receipt.challenge))).status).toBe(503);
    expect((await ack(f.attempt,'0'.repeat(64))).status).toBe(503);
    expect((await ack(f.attempt,receipt.challenge)).status).toBe(503);
    expect((await ack(receipt.attemptId,receiptProof(payload.data.assistantText,receipt.challenge))).status).toBe(200);
    expect((await ack(receipt.attemptId,receiptProof(payload.data.assistantText,receipt.challenge))).status).toBe(200);
    const {rows:[after]}=await pool.query('select revoked_at from public.record_access_grants where id=$1',[f.grant]);
    expect(after.revoked_at).not.toBeNull();
    expect(await readOwnerLifecycle(f)).toMatchObject({
      grantState:'not_granted',currentlyGranted:false,grantedAt:null,
    });
    expect(await requestRevoke(f)).toMatchObject({status:'committed',replayed:true});
    await f.locked()({signal:new AbortController().signal,deliver:async text=>expect(text).toBeNull()});
  });

  it('serializes two real sessions: lifecycle stays exact through a locked issue, pending revoke, and receipt',async()=>{
    const f=await prepare(9);await f.commit();
    expect(await readOwnerLifecycle(f)).toMatchObject({grantState:'active',currentlyGranted:true});
    let issued!:()=>void,release!:()=>void;
    const issuanceReached=new Promise<void>(resolve=>{issued=resolve;});
    const permit=new Promise<void>(resolve=>{release=resolve;});
    const proof='9'.repeat(64);
    const issuance=f.run(async({client})=>{
      const r=await client.query(`select * from public.cmd_issue_seyeon_positive_first_reply_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,sha256(convert_to($9,'UTF8')))`,[
        f.subject,f.thread,f.turn,f.attempt,f.user,f.assistant,uuid(23,9),uuid(30,9),proof]);
      expect(r.rows).toHaveLength(1);issued();await permit;
    });
    await issuanceReached;
    let revokeComplete=false;
    const revoke=requestRevoke(f).then(r=>{revokeComplete=true;return r;});
    // Distinct PostgreSQL backend must WAIT for the issuing transaction
    // rather than relying on a fixed sleep as a concurrency proof.
    let observedLockWait=false;
    for(let i=0;i<100;i++){
      const {rows:[waiting]}=await pool.query(`select exists(
        select 1 from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock'
          and pid<>pg_backend_pid()) as waiting`);
      if(waiting.waiting===true){observedLockWait=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    try{
      expect(observedLockWait).toBe(true);
      expect(revokeComplete).toBe(false);
    }finally{
      release();
    }
    await issuance;
    expect(await revoke).toMatchObject({status:'pending',newUseBlocked:true});
    expect(await readOwnerLifecycle(f)).toMatchObject({
      grantState:'withdrawal_pending',currentlyGranted:false,grantedAt:null,
    });
    expect((await ack(f.attempt,receiptProof(f.assistantText,proof))).status).toBe(200);
    expect(await requestRevoke(f)).toMatchObject({status:'committed'});
    expect(await readOwnerLifecycle(f)).toMatchObject({
      grantState:'not_granted',currentlyGranted:false,grantedAt:null,
    });
  });

  it('keeps a lost/crashed Fetch issuance durable across new DB sessions; time and ordinary deletion never manufacture receipt',async()=>{
    const f=await prepare(10);const response=await fetchReply(f);
    expect(response.status).toBe(200);
    // Simulate losing the entire Response without reading its challenge.
    await response.body?.cancel();
    expect(await requestRevoke(f)).toMatchObject({status:'pending',newUseBlocked:true});
    await expect(pool.query('delete from public.chat_turn_attempts where id=$1',[f.attempt]))
      .rejects.toMatchObject({constraint:'seyeon_positive_delivery_receipt_pending'});
    await expect(f.run(({client})=>client.query('update public.chat_turn_attempts set seyeon_positive_delivery_received_at=clock_timestamp() where id=$1',[f.attempt])))
      .rejects.toMatchObject({code:'42501'});
    expect(await requestRevoke(f)).toMatchObject({status:'pending',newUseBlocked:true});
  });

  it('enforces owned-Memory lifecycle against cross-Member substitution and direct SQL roles',async()=>{
    const owner=await prepare(11);
    const other=await prepare(12);
    const lifecycleSql=`select grant_state,granted_at from
      public.qry_seyeon_memory_grant_lifecycle_v1($1::uuid,$2::uuid)`;
    expect(await readOwnerLifecycle(owner)).toMatchObject({
      grantState:'active',currentlyGranted:true,
    });
    await expect(owner.run(({client})=>client.query(lifecycleSql,[
      owner.subject,other.memory,
    ]))).rejects.toMatchObject({constraint:'seyeon_grant_lifecycle_memory_unavailable'});
    await expect(owner.run(({client})=>client.query(lifecycleSql,[
      other.subject,other.memory,
    ]))).rejects.toMatchObject({constraint:'myeongha_subject_context_mismatch'});
    const {rows:[acl]}=await pool.query<{
      definer:boolean;
      apiExecute:boolean;
      anonDenied:boolean;
      memberDenied:boolean;
      serviceRoleDenied:boolean;
      noGrantUpdates:boolean;
      noMemoryUpdates:boolean;
    }>(`select
      p.prosecdef as definer,
      has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE') as "apiExecute",
      not has_function_privilege('anon',p.oid,'EXECUTE') as "anonDenied",
      not has_function_privilege('authenticated',p.oid,'EXECUTE') as "memberDenied",
      not has_function_privilege('service_role',p.oid,'EXECUTE') as "serviceRoleDenied",
      not has_table_privilege('myeongha_api_executor','public.record_access_grants','UPDATE') as "noGrantUpdates",
      not has_table_privilege('myeongha_api_executor','public.memory_items','UPDATE') as "noMemoryUpdates"
      from pg_proc p
      where p.oid='public.qry_seyeon_memory_grant_lifecycle_v1(uuid,uuid)'::regprocedure`);
    expect(acl).toMatchObject({
      definer:true,apiExecute:true,anonDenied:true,
      memberDenied:true,serviceRoleDenied:true,
      noGrantUpdates:true,noMemoryUpdates:true,
    });
  });

  it('G3 S0 replays the first delivered original Assistant over a real Node HTTP socket only while its original Grant is current',async()=>{
    const f=await prepare(216,{summary:'synthetic original memory for replay'});
    await f.commit();
    let firstText:string|null=null;
    await f.locked()({signal:new AbortController().signal,deliver:async text=>{
      firstText=text;
    }});
    expect(firstText).toBe(f.assistantText);

    // Before testing the socket, prove the DB-authoritative replay row is
    // eligible. A failing expectation here identifies a SQL authority gap
    // rather than misdiagnosing the 503 as a transport error.
    const diagnosticClient=await pool.connect();
    let replayRows;
    try{
      await diagnosticClient.query('BEGIN');
      await diagnosticClient.query(
        "select set_config('myeongha.subject_id',$1,true)",[f.subject],
      );
      const metadata=await diagnosticClient.query(`select t.state,t.delivered_at is not null as "deliveredAt",
        a.seyeon_positive_delivery_issued_at is null as "noIssuedReceipt",
        m.body_text=a.generated_body_text as "sameOriginalText",
        c.left_at is null as "participantCurrent"
        from public.conversation_messages m
        join public.chat_turns t on t.id=m.turn_id
        join public.chat_turn_attempts a on a.id=t.committed_attempt_id
        join public.conversation_thread_characters c on c.id=m.thread_character_id
        where m.id=$1`,[f.assistant]);
      const rows=await diagnosticClient.query(
        'select assistant_text as "assistantText" from seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1($1::uuid,$2::uuid,$3::uuid)',
        [f.subject,f.thread,f.assistant],
      );
      replayRows={metadata:metadata.rows,replay:rows.rows};
    }finally{
      await diagnosticClient.query('ROLLBACK');
      diagnosticClient.release();
    }
    expect(replayRows).toEqual({
      metadata:[{state:'delivered',deliveredAt:true,noIssuedReceipt:true,
        sameOriginalText:true,participantCurrent:true}],
      replay:[{assistantText:f.assistantText}],
    });

    const other=await prepare(217);
    await other.commit();
    const send=async(evidence:typeof f.evidence,assistantId=f.assistant,
      authorization=true)=>{
      const server=createServer((incoming,response)=>{
        void handleSeyeonFirstOriginalAssistantReplayNodeS0V1({
          incoming,response,pool:subjectPool,requestId:'original-replay-216',
          identityEvidenceVerifier:{verifyRequestIdentity:async(request)=>
            authorization && request.headers.get('authorization')==='Bearer synthetic-member'
              ?evidence:null},
        });
      });
      await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
      try{
        const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${f.thread}/original-replay/${assistantId}`,{
          headers:authorization?{Authorization:'Bearer synthetic-member'}:{},
        });
        return {status:response.status,cache:response.headers.get('Cache-Control'),
          body:await response.text()};
      }finally{
        server.closeAllConnections();
        await new Promise<void>(resolve=>server.close(()=>resolve()));
      }
    };

    const first=await send(f.evidence);
    expect(first.status).toBe(200);
    expect(first.cache).toContain('no-store');
    expect(first.body).toContain(f.assistantText);
    const second=await send(f.evidence);
    expect(second.status).toBe(200);
    expect(second.body).toContain(f.assistantText);

    // A distinct, still-unmounted direct Node path combines the exact
    // Member-authored first User with this same original-Grant-locked reply.
    const sendPair=async(evidence:typeof f.evidence,authorized=true)=>{
      const server=createServer((incoming,response)=>{
        void handleSeyeonFirstOriginalDialoguePairNodeS0V1({
          incoming,response,pool:subjectPool,requestId:'original-pair-216',
          identityEvidenceVerifier:{verifyRequestIdentity:async(request)=>
            authorized && request.headers.get('authorization')==='Bearer synthetic-member'
              ?evidence:null},
        });
      });
      await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
      try{
        const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${f.thread}/original-pair/${f.assistant}`,{
          headers:authorized?{Authorization:'Bearer synthetic-member'}:{},
        });
        return {status:response.status,body:await response.text()};
      }finally{
        server.closeAllConnections();
        await new Promise<void>(resolve=>server.close(()=>resolve()));
      }
    };
    const firstPair=await sendPair(f.evidence);
    expect(firstPair.status).toBe(200);
    expect(JSON.parse(firstPair.body).data).toMatchObject({
      threadId:f.thread,userMessageId:f.user,userText:f.userText,
      assistantMessageId:f.assistant,assistantText:f.assistantText,
    });
    expect((await sendPair(other.evidence)).status).toBe(503);
    const unverifiedPair=await sendPair(f.evidence,false);
    expect(unverifiedPair.status).toBe(401);
    expect(unverifiedPair.body).not.toContain(f.userText);

    const unverified=await send(f.evidence,f.assistant,false);
    expect(unverified.status).toBe(401);
    expect(unverified.body).not.toContain(f.assistantText);
    const foreign=await send(other.evidence);
    expect(foreign.status).toBe(503);
    expect(foreign.body).not.toContain(f.assistantText);
    const wrongOriginal=await send(f.evidence,f.user);
    expect(wrongOriginal.status).toBe(503);
    expect(wrongOriginal.body).not.toContain(f.assistantText);

    await f.revoke();
    const withdrawn=await send(f.evidence);
    expect(withdrawn.status).toBe(503);
    expect(withdrawn.body).not.toContain(f.assistantText);
    const withdrawnPair=await sendPair(f.evidence);
    expect(withdrawnPair.status).toBe(503);
    expect(withdrawnPair.body).not.toContain(f.userText);
    expect(withdrawnPair.body).not.toContain(f.assistantText);

    // Reconsent issues a distinct Grant; it must never revive this Attempt.
    await pool.query(`insert into public.record_access_grants(
      id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at)
      values($1,$2,$3,'seyeon','user_choice',clock_timestamp())`,
      [uuid(29,216),f.subject,f.memory]);
    const newlyGranted=await send(f.evidence);
    expect(newlyGranted.status).toBe(503);
    expect(newlyGranted.body).not.toContain(f.assistantText);
    const regrantedPair=await sendPair(f.evidence);
    expect(regrantedPair.status).toBe(503);
    expect(regrantedPair.body).not.toContain(f.userText);
  });

  it('UC-06 verifies exact committed DB originals before any metered Planner call',async()=>{
    const f=await prepare(210);
    await f.commit();
    const source={canonicalMemberSubjectId:f.subject,turnId:f.turn,
      userMessageId:f.user,userText:f.userText,
      assistantMessageId:f.assistant,assistantText:f.assistantText};
    await expect(f.run(({client})=>verifySeyeonPlannerPreModelSourceV1(
      client,source,
    ))).resolves.toBeUndefined();
    await expect(f.run(({client})=>verifySeyeonPlannerPreModelSourceV1(
      client,{...source,userText:'Synthetic forged user text'},
    ))).rejects.toMatchObject({code:'SEYEON_PLANNER_PRE_MODEL_SOURCE_HOLD'});
    await expect(f.run(({client})=>verifySeyeonPlannerPreModelSourceV1(
      client,{...source,assistantText:'Synthetic forged assistant text'},
    ))).rejects.toMatchObject({code:'SEYEON_PLANNER_PRE_MODEL_SOURCE_HOLD'});
    await expect(f.run(({client})=>verifySeyeonPlannerPreModelSourceV1(
      client,{...source,assistantMessageId:f.user},
    ))).rejects.toMatchObject({code:'SEYEON_PLANNER_PRE_MODEL_SOURCE_HOLD'});
    const {rows:[count]}=await pool.query(`select
      (select count(*)::int from public.memory_proposals
       where source_turn_id=$1) as proposals,
      (select count(*)::int from public.record_access_grants
       where subject_id=$2) as grants`,[f.turn,f.subject]);
    expect(count).toEqual({proposals:0,grants:1});
  });

  it('W48 keeps a DB-original historical candidate durable without model/Commit/Reveal rights', async () => {
    const f = await prepare(218, { summary: 'synthetic approved recall' });
    await f.commit();
    await f.locked()({ signal: new AbortController().signal, deliver: async value => {
      expect(value).toBe(f.assistantText);
    } });
    const currentTurn=uuid(16,1218), currentAttempt=uuid(17,1218);
    const currentUser=uuid(18,1218), currentText='Second original message for historical W48';
    const receive=await pool.connect();
    try {
      await receive.query('BEGIN');
      await receive.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await receive.query(`select * from public.cmd_receive_chat_turn_v1(
        $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
        $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text
      )`,[
        f.subject,f.thread,uuid(30,1218),hash({second:'W48'}),
        'chat-request-v1',JSON.stringify({text:currentText}),
        uuid(13,218),uuid(12,218),currentTurn,currentUser,
        currentText,null,hash({message:currentText}),
      ]);
      await receive.query(
        'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
        [f.subject,currentTurn,currentAttempt,'seyeon-production-chat-planner-v1']
      );
      await receive.query('COMMIT');
    } catch(error) {
      await receive.query('ROLLBACK'); throw error;
    } finally { receive.release(); }
    const {rows:[original]}=await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex')
      as digest from public.memory_items where id=$1`,[f.memory]);
    const selected={
      recordKind:'memory' as const,recordId:f.memory,grantId:f.grant,
      recordType:'conversation_recall',schemaVersion:'v1',
      rawRecordDigest:hash({summary:'synthetic approved recall'}),
      rawRecordPgDigest:original.digest as string,
      projectedMemoryDigest:hash({memoryId:f.memory,summary:'synthetic approved recall'}),
      projectorVersion:'seyeon-conversation-recall-projector-v1',
    };
    const wire=(text:string)=>'sha256:wire-utf8:v1:'+
      createHash('sha256').update(text,'utf8').digest('hex');
    const history=[
      {messageId:f.user,role:'user' as const,textDigest:wire(f.userText)},
      {messageId:f.assistant,role:'assistant' as const,textDigest:wire(f.assistantText)},
    ];
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      const proof=await createSeyeonG1HistoricalCandidateOwnerPortV1(client)
        .pinBeforeModel({
          subjectId:f.subject,threadId:f.thread,turnId:currentTurn,attemptId:currentAttempt,
          currentUserMessageId:currentUser,currentUserTextDigest:wire(currentText),
          selectedOriginalMemory:selected,selectedSourcesDigest:hash([selected]),
          preModelContextDigest:hash({historical:'W48'}),
          historicalSources:history,
        });
      expect(proof.historicalSourceCount).toBe(2);
      expect(proof.authorizesModel).toBe(false);
      expect(proof.permitsAtomicCommit).toBe(false);
      expect(proof.permitsHttpReveal).toBe(false);
      await client.query('COMMIT');
    } catch(error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
    const {rows:[saved]}=await pool.query(`select
      state,seyeon_personal_source_pin_jsonb as proof
      from public.chat_turn_attempts where id=$1`,[currentAttempt]);
    expect(saved.state).toBe('running');
    expect(saved.proof.historicalCandidateProof.historicalSourceCount).toBe(2);
    expect(saved.proof.historicalCandidateProof.schemaVersion)
      .toBe('seyeon-g1-historical-source-candidate-v2');
    expect(saved.proof.historicalCandidateProof.historicalAssistantOriginalSources)
      .toEqual([{
        messageId:f.assistant,turnId:f.turn,attemptId:f.attempt,
        originalUserMessageId:f.user,originalUserTextDigest:wire(f.userText),
        recordId:f.memory,originalGrantId:f.grant,
        originalPgJsonbDigest:original.digest,
        recordType:'conversation_recall',recordSchemaVersion:'v1',
        projectorVersion:'seyeon-conversation-recall-projector-v1',
      }]);
    const {rows:[digestCheck]}=await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(
        (seyeon_personal_source_pin_jsonb->'historicalCandidateProof'
         ->'historicalAssistantOriginalSources')::text,'UTF8')),'hex') as digest
      from public.chat_turn_attempts where id=$1`,[currentAttempt]);
    expect(saved.proof.historicalCandidateProof.historicalAssistantOriginalSourcesDigest)
      .toBe(digestCheck.digest);
    expect(saved.proof.historicalCandidateProof.permitsHttpReveal).toBe(false);
    const {rows:[acl]}=await pool.query(`select not has_function_privilege(
      'myeongha_api_executor',
      'seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,jsonb)',
      'EXECUTE') as denied`);
    expect(acl.denied).toBe(true);
  });

  it('G5 historical candidate cannot pin a revoked original Grant during an independent DB race', async () => {
    const f=await prepare(220,{summary:'synthetic approved recall'});
    await f.commit();
    await f.locked()({signal:new AbortController().signal,deliver:async value=>{
      expect(value).toBe(f.assistantText);
    }});
    const currentTurn=uuid(16,1220),currentAttempt=uuid(17,1220);
    const currentUser=uuid(18,1220),currentText='Fresh user turn after a sealed Assistant reply';
    const setup=await pool.connect();
    try {
      await setup.query('BEGIN');
      await setup.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await setup.query(`select * from public.cmd_receive_chat_turn_v1(
        $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
        $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text
      )`,[
        f.subject,f.thread,uuid(30,1220),hash({second:'G5-history-race'}),
        'chat-request-v1',JSON.stringify({text:currentText}),
        uuid(13,220),uuid(12,220),currentTurn,currentUser,
        currentText,null,hash({message:currentText}),
      ]);
      await setup.query(
        'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
        [f.subject,currentTurn,currentAttempt,'seyeon-production-chat-planner-v1']
      );
      await setup.query('COMMIT');
    }catch(error){
      await setup.query('ROLLBACK');throw error;
    }finally{setup.release();}
    const {rows:[original]}=await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex')
      as digest from public.memory_items where id=$1`,[f.memory]);
    const selected={
      recordKind:'memory' as const,recordId:f.memory,grantId:f.grant,
      recordType:'conversation_recall',schemaVersion:'v1',
      rawRecordDigest:hash({summary:'synthetic approved recall'}),
      rawRecordPgDigest:original.digest as string,
      projectedMemoryDigest:hash({memoryId:f.memory,summary:'synthetic approved recall'}),
      projectorVersion:'seyeon-conversation-recall-projector-v1',
    };
    const wire=(text:string)=>'sha256:wire-utf8:v1:'+
      createHash('sha256').update(text,'utf8').digest('hex');
    const revoker=await pool.connect();
    const candidate=await pool.connect();
    const marker='seyeon_g5_historical_candidate_revoke_waiter';
    try{
      await revoker.query('BEGIN');
      await revoker.query(
        'select id from public.record_access_grants where id=$1::uuid for update',
        [f.grant],
      );
      await revoker.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [f.grant],
      );
      await candidate.query("select set_config('application_name',$1,false)",[marker]);
      await candidate.query('BEGIN');
      await candidate.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      const pending=createSeyeonG1HistoricalCandidateOwnerPortV1(candidate)
        .pinBeforeModel({
          subjectId:f.subject,threadId:f.thread,turnId:currentTurn,attemptId:currentAttempt,
          currentUserMessageId:currentUser,currentUserTextDigest:wire(currentText),
          selectedOriginalMemory:selected,selectedSourcesDigest:hash([selected]),
          preModelContextDigest:hash({historical:'G5-revoke-race'}),
          historicalSources:[
            {messageId:f.user,role:'user',textDigest:wire(f.userText)},
            {messageId:f.assistant,role:'assistant',textDigest:wire(f.assistantText)},
          ],
        }).then(receipt=>({ok:true as const,receipt}),
          error=>({ok:false as const,error}));
      let wasBlocked=false;
      for(let i=0;i<80;i++){
        const {rows}=await pool.query<{blocked:boolean}>(`select exists(
          select 1 from pg_catalog.pg_stat_activity
          where application_name=$1 and wait_event_type='Lock'
        ) as blocked`,[marker]);
        if(rows[0]?.blocked){wasBlocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      expect(wasBlocked).toBe(true);
      await revoker.query('COMMIT');
      const outcome=await pending;
      expect(outcome.ok).toBe(false);
      if(!outcome.ok)expect(outcome.error).toMatchObject({
        code:'42501',constraint:'seyeon_source_lock_original_grant_required',
      });
    }finally{
      await revoker.query('ROLLBACK').catch(()=>undefined);
      await candidate.query('ROLLBACK').catch(()=>undefined);
      await candidate.query("select set_config('application_name','',false)")
        .catch(()=>undefined);
      revoker.release();candidate.release();
    }
    const {rows:[state]}=await pool.query(`select
      t.state as turn_state,a.seyeon_personal_source_pin_jsonb as pin,
      a.seyeon_personal_source_pinned_at as pinned_at
      from public.chat_turn_attempts a join public.chat_turns t on t.id=a.turn_id
      where a.id=$1`,[currentAttempt]);
    expect(state).toMatchObject({turn_state:'planned',pin:null,pinned_at:null});
  });

  it('G5 original historical candidate pins first, revoke waits, then all current source reads deny',async()=>{
    const f=await prepare(221,{summary:'synthetic approved recall'});
    await f.commit();
    await f.locked()({signal:new AbortController().signal,deliver:async value=>{
      expect(value).toBe(f.assistantText);
    }});
    const turn=uuid(16,1221),attempt=uuid(17,1221);
    const user=uuid(18,1221),text='Fresh historical source user with revoke pending';
    const receiver=await pool.connect();
    try{
      await receiver.query('BEGIN');
      await receiver.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await receiver.query(`select * from public.cmd_receive_chat_turn_v1(
        $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
        $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text
      )`,[
        f.subject,f.thread,uuid(30,1221),hash({second:'G5-history-pin-first'}),
        'chat-request-v1',JSON.stringify({text}),
        uuid(13,221),uuid(12,221),turn,user,text,null,hash({message:text}),
      ]);
      await receiver.query(
        'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
        [f.subject,turn,attempt,'seyeon-production-chat-planner-v1']);
      await receiver.query('COMMIT');
    }catch(error){await receiver.query('ROLLBACK');throw error;}
    finally{receiver.release();}
    const {rows:[original]}=await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex')
      as digest from public.memory_items where id=$1`,[f.memory]);
    const selected={
      recordKind:'memory' as const,recordId:f.memory,grantId:f.grant,
      recordType:'conversation_recall',schemaVersion:'v1',
      rawRecordDigest:hash({summary:'synthetic approved recall'}),
      rawRecordPgDigest:original.digest as string,
      projectedMemoryDigest:hash({memoryId:f.memory,summary:'synthetic approved recall'}),
      projectorVersion:'seyeon-conversation-recall-projector-v1',
    };
    const wire=(value:string)=>'sha256:wire-utf8:v1:'+
      createHash('sha256').update(value,'utf8').digest('hex');
    const candidate=await pool.connect();
    const revoker=await pool.connect();
    const marker='seyeon_g5_historical_revoke_after_pin_waiter';
    try{
      await candidate.query('BEGIN');
      await candidate.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      const proof=await createSeyeonG1HistoricalCandidateOwnerPortV1(candidate)
        .pinBeforeModel({
          subjectId:f.subject,threadId:f.thread,turnId:turn,attemptId:attempt,
          currentUserMessageId:user,currentUserTextDigest:wire(text),
          selectedOriginalMemory:selected,selectedSourcesDigest:hash([selected]),
          preModelContextDigest:hash({historical:'G5-pin-first'}),
          historicalSources:[
            {messageId:f.user,role:'user',textDigest:wire(f.userText)},
            {messageId:f.assistant,role:'assistant',textDigest:wire(f.assistantText)},
          ],
        });
      expect(proof).toMatchObject({
        historicalSourceCount:2,authorizesModel:false,
        permitsAtomicCommit:false,permitsHttpReveal:false,
      });
      await revoker.query("select set_config('application_name',$1,false)",[marker]);
      await revoker.query('BEGIN');
      const pending=revoker.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [f.grant],
      ).then(result=>({ok:true as const,count:result.rowCount}),
        error=>({ok:false as const,error}));
      let blocked=false;
      for(let i=0;i<80;i++){
        const {rows}=await pool.query<{blocked:boolean}>(`select exists(
          select 1 from pg_catalog.pg_stat_activity
          where application_name=$1 and wait_event_type='Lock'
        ) as blocked`,[marker]);
        if(rows[0]?.blocked){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      expect(blocked).toBe(true);
      await candidate.query('COMMIT');
      const outcome=await pending;
      expect(outcome).toMatchObject({ok:true,count:1});
      await revoker.query('COMMIT');
    }finally{
      await candidate.query('ROLLBACK').catch(()=>undefined);
      await revoker.query('ROLLBACK').catch(()=>undefined);
      await revoker.query("select set_config('application_name','',false)")
        .catch(()=>undefined);
      candidate.release();revoker.release();
    }
    const {rows:[saved]}=await pool.query(`select
      t.state as turn_state,a.seyeon_personal_source_pin_jsonb as pin
      from public.chat_turn_attempts a join public.chat_turns t on t.id=a.turn_id
      where a.id=$1`,[attempt]);
    expect(saved.turn_state).toBe('context_ready');
    expect(saved.pin).toMatchObject({historicalCandidateProof:{
      authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    }});
    expect(saved.pin).not.toHaveProperty('positiveProof');
    const reader=await pool.connect();
    try{
      await reader.query('BEGIN');
      await reader.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await expect(reader.query(
        'select * from public.qry_seyeon_g0_current_source_recent_messages_v1($1::uuid,$2::uuid,$3::uuid,$4::integer)',
        [f.subject,f.thread,user,3],
      )).rejects.toMatchObject({
        code:'42501',constraint:'seyeon_source_lock_original_grant_required',
      });
    }finally{
      await reader.query('ROLLBACK').catch(()=>undefined);
      reader.release();
    }
  });

  it('G5 held historical User provenance blocks redaction, then refuses all later G0 reuse',async()=>{
    const f=await prepare(223,{summary:'synthetic approved recall'});
    await f.commit();
    await f.locked()({signal:new AbortController().signal,deliver:async value=>{
      expect(value).toBe(f.assistantText);
    }});
    const turn=uuid(16,1223),attempt=uuid(17,1223);
    const user=uuid(18,1223),text='Fresh User after historical Assistant';
    const receiver=await pool.connect();
    try{
      await receiver.query('BEGIN');
      await receiver.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await receiver.query(`select * from public.cmd_receive_chat_turn_v1(
        $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
        $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text
      )`,[
        f.subject,f.thread,uuid(30,1223),hash({second:'G5-original-user-redaction'}),
        'chat-request-v1',JSON.stringify({text}),
        uuid(13,223),uuid(12,223),turn,user,text,null,hash({message:text}),
      ]);
      await receiver.query(
        'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
        [f.subject,turn,attempt,'seyeon-production-chat-planner-v1']);
      await receiver.query('COMMIT');
    }catch(error){await receiver.query('ROLLBACK');throw error;}
    finally{receiver.release();}
    const {rows:[original]}=await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex')
      as digest from public.memory_items where id=$1`,[f.memory]);
    const selected={
      recordKind:'memory' as const,recordId:f.memory,grantId:f.grant,
      recordType:'conversation_recall',schemaVersion:'v1',
      rawRecordDigest:hash({summary:'synthetic approved recall'}),
      rawRecordPgDigest:original.digest as string,
      projectedMemoryDigest:hash({memoryId:f.memory,summary:'synthetic approved recall'}),
      projectorVersion:'seyeon-conversation-recall-projector-v1',
    };
    const wire=(value:string)=>'sha256:wire-utf8:v1:'+
      createHash('sha256').update(value,'utf8').digest('hex');
    const candidate=await pool.connect(),redactor=await pool.connect();
    const marker='seyeon_g5_original_user_redaction_waiter';
    try{
      await candidate.query('BEGIN');
      await candidate.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      const proof=await createSeyeonG1HistoricalCandidateOwnerPortV1(candidate)
        .pinBeforeModel({
          subjectId:f.subject,threadId:f.thread,turnId:turn,attemptId:attempt,
          currentUserMessageId:user,currentUserTextDigest:wire(text),
          selectedOriginalMemory:selected,selectedSourcesDigest:hash([selected]),
          preModelContextDigest:hash({historical:'G5-original-user-redaction'}),
          historicalSources:[
            {messageId:f.user,role:'user',textDigest:wire(f.userText)},
            {messageId:f.assistant,role:'assistant',textDigest:wire(f.assistantText)},
          ],
        });
      expect(proof).toMatchObject({
        authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
      });
      await redactor.query("select set_config('application_name',$1,false)",[marker]);
      await redactor.query('BEGIN');
      const pending=redactor.query(
        'update public.conversation_messages set redacted_at=clock_timestamp(), redaction_reason=$2::text where id=$1::uuid',
        [f.user,'g5_synthetic_original_user_redaction'],
      ).then(result=>({ok:true as const,count:result.rowCount}),
        error=>({ok:false as const,error}));
      let blocked=false;
      for(let i=0;i<80;i++){
        const {rows}=await pool.query<{blocked:boolean}>(`select exists(
          select 1 from pg_catalog.pg_stat_activity
          where application_name=$1 and wait_event_type='Lock'
        ) as blocked`,[marker]);
        if(rows[0]?.blocked){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      expect(blocked).toBe(true);
      await candidate.query('COMMIT');
      const outcome=await pending;
      expect(outcome).toMatchObject({ok:true,count:1});
      await redactor.query('COMMIT');
    }finally{
      await candidate.query('ROLLBACK').catch(()=>undefined);
      await redactor.query('ROLLBACK').catch(()=>undefined);
      await redactor.query("select set_config('application_name','',false)")
        .catch(()=>undefined);
      candidate.release();redactor.release();
    }
    const {rows:[saved]}=await pool.query(`select
      t.state as turn_state,a.seyeon_personal_source_pin_jsonb as pin
      from public.chat_turn_attempts a join public.chat_turns t on t.id=a.turn_id
      where a.id=$1`,[attempt]);
    expect(saved.turn_state).toBe('context_ready');
    expect(saved.pin).toMatchObject({historicalCandidateProof:{
      authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    }});
    expect(saved.pin).not.toHaveProperty('positiveProof');
    const reader=await pool.connect();
    try{
      await reader.query('BEGIN');
      await reader.query("select set_config('myeongha.subject_id',$1,true)",[f.subject]);
      await expect(reader.query(
        'select * from public.qry_seyeon_g0_current_source_recent_messages_v1($1::uuid,$2::uuid,$3::uuid,$4::integer)',
        [f.subject,f.thread,user,3],
      )).rejects.toMatchObject({
        code:'42501',constraint:'seyeon_g0_context_window_source_missing',
      });
    }finally{
      await reader.query('ROLLBACK').catch(()=>undefined);
      reader.release();
    }
  });

  // Real S0 original receipt + private G4 credit on ONE disposable PostgreSQL.
  // It intentionally uses the existing prepare/fetchReply S0 test fixtures.
  let g5CreditSchemaInstalled=false;
  const privateG5Pool=():PostgresSubjectPoolV1=>Object.freeze({connect:()=>pool.connect()});
  async function installDisposableG5Credit(){
    if(g5CreditSchemaInstalled)return;
    const db=process.env.PGDATABASE??'';
    if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
       process.env.DB_SUITE!=='postgres17'||process.env.PGHOST!=='localhost'||
       !/^myeongha_ci_case_[0-9]+$/u.test(db)){
      throw Error('HOLD: G5 integration only in isolated Actions PG17 clone');
    }
    // Recreate the candidate ledger only on the disposable cloned schema.
    await pool.query(`drop trigger if exists tr_chat_credit_member_signup_v1 on public.subjects;
      drop trigger if exists tr_chat_credit_subject_erasure_v1 on public.subjects;
      drop function if exists commerce_credit_private.internal_tr_chat_credit_member_signup_v1();
      drop function if exists commerce_credit_private.internal_tr_chat_credit_subject_erasure_v1();
      drop function if exists public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid);
      drop function if exists public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid);
      drop function if exists public.internal_cmd_chat_signup_credit_v1(uuid);
      drop function if exists public.internal_qry_chat_credit_balance_v1(uuid);
      drop table if exists public.chat_credit_turn_allocations_v1 cascade;
      drop table if exists public.chat_credit_turn_reservations_v1 cascade;
      drop table if exists public.chat_credit_lots_v1 cascade;`);
    for(const path of [
      '../test/db/candidates/chat_credit_private_ledger_v1.sql',
      '../supabase/migrations/20261027125500_chat_credit_delivered_ack_private_v1.sql',
      '../test/db/candidates/seyeon_g4_private_credit_role_only_v1.sql',
      '../test/db/candidates/seyeon_g4_receipt_credit_settle_private_v1.sql',
      '../test/db/candidates/seyeon_g5_received_credit_recovery_catalog_v1.sql',
    ]){
      await pool.query(readFileSync(new URL(path,import.meta.url),'utf8'));
    }
    const {rows:[acl]}=await pool.query(`select
      not has_function_privilege('myeongha_api_executor',
        'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') as api_denied,
      not has_function_privilege('authenticated',
        'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') as public_denied,
      has_function_privilege('myeongha_commerce_internal_executor',
        'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') as commerce_only,
      not has_function_privilege('myeongha_api_executor',
        'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as catalog_api_denied,
      has_function_privilege('myeongha_commerce_internal_executor',
        'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as catalog_commerce_only,
      not has_function_privilege('authenticated',
        'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as catalog_member_denied,
      not has_function_privilege('service_role',
        'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as catalog_service_denied`);
    expect(acl).toEqual({api_denied:true,public_denied:true,commerce_only:true,
      catalog_api_denied:true,catalog_commerce_only:true,
      catalog_member_denied:true,catalog_service_denied:true});
    g5CreditSchemaInstalled=true;
  }
  async function reserveFirstPositive(f:Awaited<ReturnType<typeof prepare>>){
    await pool.query('select public.internal_cmd_chat_signup_credit_v1($1::uuid)',[f.subject]);
    return executePostgresCommerceInternalTransactionV1({
      pool:privateG5Pool(),
      execute:async({client})=>{
        await client.query('select pg_catalog.set_config($1,$2,true)',
          ['myeongha.subject_id',f.subject]);
        const r=await client.query<{outcome:string;reservation_id:string}>(
          'select outcome,reservation_id from public.internal_cmd_chat_credit_reserve_v1($1,$2,$3)',
          [f.subject,f.thread,uuid(30,f.n)]);
        expect(r.rows[0]?.outcome).toBe('reserved');
        expect(r.rows[0]?.reservation_id).toBeTruthy();
        return r.rows[0]!.reservation_id;
      },
    });
  }
  async function creditState(f:Awaited<ReturnType<typeof prepare>>){
    const {rows:[r]}=await pool.query<{state:string;available:string;credits:string}>(`select r.state,
      (select available_credits from public.internal_qry_chat_credit_balance_v1($1))::text as available,
      (select coalesce(sum(a.credits),0) from public.chat_credit_turn_allocations_v1 a
       where a.reservation_id=r.id)::text as credits
      from public.chat_credit_turn_reservations_v1 r
      where r.subject_id=$1 and r.client_turn_id=$2`,[f.subject,uuid(30,f.n)]);
    return {state:r?.state,available:r?.available,credits:r?.credits};
  }
  const creditReceipt=(f:Awaited<ReturnType<typeof prepare>>,attempt:string,proof:string,
    privateCreditPool:PostgresSubjectPoolV1=privateG5Pool())=>
    handleSeyeonPositiveReceiptAndCreditCandidateV1({
      request:new Request('https://receipt.test/api/chat/delivery-receipts/'+attempt,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({proof}),
      }),
      requestId:'g5-real-http-credit',receiptPool:subjectPool,privateCreditPool,
    });

  // Only the Actions PG17 named throwaway clone can host the Commerce candidate.
  // Do not register skipped tests in the separate restored-backup rehearsal,
  // whose evidence requires zero pending tests.
  if(process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&
     process.env.DB_SUITE==='postgres17'&&process.env.PGHOST==='localhost'&&
     /^myeongha_ci_case_[0-9]+$/u.test(process.env.PGDATABASE??'')){

  it('G5 separate DB role sessions deny ordinary API and allow only private Commerce catalog/settlement RPCs',async()=>{
    await installDisposableG5Credit();
    const publicApi=await pool.connect();
    const privateCommerce=await pool.connect();
    try{
      await publicApi.query('BEGIN');
      await publicApi.query('SET LOCAL ROLE myeongha_api_executor');
      await privateCommerce.query('BEGIN');
      await privateCommerce.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
      const {rows:[apiRole]}=await publicApi.query(
        'select current_user as role, session_user as login');
      const {rows:[commerceRole]}=await privateCommerce.query(
        'select current_user as role, session_user as login');
      expect(apiRole.role).toBe('myeongha_api_executor');
      expect(commerceRole.role).toBe('myeongha_commerce_internal_executor');
      const rpc='public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)';
      const settle='public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)';
      const {rows:[apiAcl]}=await publicApi.query(
        `select has_function_privilege(current_user,$1,'EXECUTE') as catalog,
                has_function_privilege(current_user,$2,'EXECUTE') as settle,
                has_table_privilege(current_user,'public.chat_credit_turn_reservations_v1','UPDATE') as ledger_update`,
        [rpc,settle]);
      expect(apiAcl).toEqual({catalog:false,settle:false,ledger_update:false});
      const {rows:[commerceAcl]}=await privateCommerce.query(
        `select has_function_privilege(current_user,$1,'EXECUTE') as catalog,
                has_function_privilege(current_user,$2,'EXECUTE') as settle,
                has_table_privilege(current_user,'public.chat_credit_turn_reservations_v1','UPDATE') as ledger_update`,
        [rpc,settle]);
      expect(commerceAcl).toEqual({catalog:true,settle:true,ledger_update:false});
      // Executable behavior, not just ACL metadata: API role cannot call the
      // recovery catalog, and its failure never contaminates Commerce session.
      await expect(publicApi.query(
        'select attempt_id from public.internal_qry_seyeon_g5_unsettled_received_attempts_v1($1::integer,$2::timestamptz)',
        [1,null],
      )).rejects.toMatchObject({code:'42501'});
      const {rows:privateResults}=await privateCommerce.query(
        'select attempt_id from public.internal_qry_seyeon_g5_unsettled_received_attempts_v1($1::integer,$2::timestamptz)',
        [1,null],
      );
      expect(privateResults).toEqual([]);
      // Separate sessions are not proof of Production secret provisioning.
      expect(apiRole.login).toBe(commerceRole.login);
    }finally{
      await publicApi.query('ROLLBACK');
      await privateCommerce.query('ROLLBACK');
      publicApi.release();privateCommerce.release();
    }
  });

  it('G5 distinct disposable DB LOGIN credentials isolate API and private Commerce authority',async()=>{
    await installDisposableG5Credit();
    const suffix=(process.env.PGDATABASE??'').replace('myeongha_ci_case_','');
    if(!/^[0-9]+$/u.test(suffix))throw Error('G5 distinct LOGIN only in named disposable CI DB');
    const apiLogin='g5_api_ci_'+suffix;
    const commerceLogin='g5_private_ci_'+suffix;
    const apiPassword=randomBytes(30).toString('hex');
    const commercePassword=randomBytes(30).toString('hex');
    // Cluster roles are disposed at the end: never create a Production login.
    const createLogin=async(name:string,password:string)=>{
      await pool.query(
        'select pg_catalog.format(\'CREATE ROLE %I LOGIN PASSWORD %L\',$1::text,$2::text)',
        [name,password],
      ).then(async r=>pool.query(r.rows[0].format));
    };
    let api:Pool|undefined,commerce:Pool|undefined;
    try{
      await createLogin(apiLogin,apiPassword);
      await createLogin(commerceLogin,commercePassword);
      // Role membership is a separate operation from credential generation.
      // These static values are permission roles, never passwords or secrets.
      await pool.query(`grant myeongha_api_executor to ${apiLogin}`);
      await pool.query(`grant myeongha_commerce_internal_executor to ${commerceLogin}`);
      const connection=Object.freeze({
        host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),
        database:process.env.PGDATABASE,ssl:false,max:1,statement_timeout:5000,
      });
      api=new Pool({...connection,user:apiLogin,password:apiPassword});
      commerce=new Pool({...connection,user:commerceLogin,password:commercePassword});
      // The physical LOGIN identity must differ even before SET ROLE.
      const {rows:[apiIdentity]}=await api.query(
        'select session_user as login,current_user as effective_role');
      const {rows:[commerceIdentity]}=await commerce.query(
        'select session_user as login,current_user as effective_role');
      expect(apiIdentity).toEqual({login:apiLogin,effective_role:apiLogin});
      expect(commerceIdentity).toEqual({login:commerceLogin,effective_role:commerceLogin});
      const apiClient=await api.connect();
      const commerceClient=await commerce.connect();
      try{
        await apiClient.query('BEGIN');
        await apiClient.query('SET LOCAL ROLE myeongha_api_executor');
        await commerceClient.query('BEGIN');
        await commerceClient.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
        const {rows:[a]}=await apiClient.query(`select session_user as login,
          current_user as effective_role,
          has_function_privilege(current_user,
            'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') as can_settle,
          has_function_privilege(current_user,
            'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as can_recover`);
        const {rows:[c]}=await commerceClient.query(`select session_user as login,
          current_user as effective_role,
          has_function_privilege(current_user,
            'public.internal_cmd_seyeon_g4_receipt_credit_settle_v1(uuid)','EXECUTE') as can_settle,
          has_function_privilege(current_user,
            'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(integer,timestamptz)','EXECUTE') as can_recover`);
        expect(a).toEqual({login:apiLogin,effective_role:'myeongha_api_executor',can_settle:false,can_recover:false});
        expect(c).toEqual({login:commerceLogin,effective_role:'myeongha_commerce_internal_executor',can_settle:true,can_recover:true});
        await expect(apiClient.query(
          'select attempt_id from public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(1,null)',
        )).rejects.toMatchObject({code:'42501'});
        const {rows:found}=await commerceClient.query(
          'select attempt_id from public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(1,null)',
        );
        expect(found).toEqual([]);
      }finally{
        await apiClient.query('ROLLBACK');
        await commerceClient.query('ROLLBACK');
        apiClient.release();commerceClient.release();
      }
    }finally{
      await api?.end();
      await commerce?.end();
      // Unconditionally remove only the names derived from the isolated CI DB.
      await pool.query(`drop role if exists ${apiLogin},${commerceLogin}`);
    }
  });

  it('G5 actual PG17 separate NOINHERIT LOGIN: checked private pool settles original receipt; excess API membership blocks checkout',async()=>{
    await installDisposableG5Credit();
    const db=process.env.PGDATABASE??'';
    if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
       process.env.DB_SUITE!=='postgres17'||process.env.PGHOST!=='localhost'||
       !/^myeongha_ci_case_[0-9]+$/u.test(db)){
      throw Error('G5 physical login must be tested only in disposable Actions PG17');
    }
    const {f,received}=await g5StrandedRaceOriginal(24);
    const login=SEYEON_G5_PRIVATE_COMMERCE_DB_V1.login;
    const {rows:existing}=await pool.query(
      'select 1 from pg_catalog.pg_roles where rolname=$1',[login]);
    expect(existing).toHaveLength(0);
    const password=randomBytes(30).toString('hex');
    const {rows:[roleDDL]}=await pool.query(
      "select pg_catalog.format('CREATE ROLE %I LOGIN NOINHERIT PASSWORD %L',$1::text,$2::text) as ddl",
      [login,password]);
    let created=false;
    let native:Pool|undefined;
    let privatePool:SeyeonG5PrivateCommercePostgresPoolV1|undefined;
    try{
      await pool.query(roleDDL.ddl);created=true;
      await pool.query(`grant myeongha_commerce_internal_executor to ${login}`);
      native=new Pool({
        host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),
        user:login,password,database:db,ssl:false,max:2,statement_timeout:5000,
      });
      const raw=native;
      privatePool=new SeyeonG5PrivateCommercePostgresPoolV1({
        async connect(){
          const c=await raw.connect();
          return {
            async query(sql,values){
              const r=values===undefined?await c.query(sql):await c.query(sql,[...values]);
              return {rows:r.rows as readonly Record<string,unknown>[]};
            },
            release(error){c.release(error);},
          };
        },
        async end(){await raw.end();},
      });
      // Before any SET LOCAL ROLE, a physical LOGIN cannot execute private
      // G4/G5 RPCs. The preflight uses this same unprivileged session.
      const {rows:[identity]}=await raw.query(
        'select session_user as login,current_user as role');
      expect(identity).toEqual({login,role:login});
      await expect(raw.query(
        'select attempt_id from public.internal_qry_seyeon_g5_unsettled_received_attempts_v1(1,null)',
      )).rejects.toMatchObject({code:'42501'});
      const safe=await privatePool.connect();safe.release();
      const asOf=new Date(Date.now()+10*60_000);
      expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:privatePool,mode:'preview',maxBatch:1,testAsOf:asOf,
      })).toEqual({status:'preview',found:1,settled:0,failed:0});
      expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
      // PostgreSQL password expiry prevents NEW authentication, but it does
      // not terminate already-authenticated pooled sessions. The G5 checkout
      // must inspect the current role validity on EACH existing session.
      await pool.query(`alter role ${login} valid until '2000-01-01 00:00:00+00'`);
      try{
        const {rows:[alive]}=await raw.query('select session_user as login');
        expect(alive.login).toBe(login);
        await expect(privatePool.connect()).rejects.toBeInstanceOf(
          SeyeonG5PrivateCommerceBoundaryErrorV1);
        await expect(recoverSeyeonG5ReceivedCreditsCandidateV1({
          privateCreditPool:privatePool,mode:'preview',maxBatch:1,testAsOf:asOf,
        })).rejects.toThrow();
        expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
      }finally{
        await pool.query(`alter role ${login} valid until '2099-01-01 00:00:00+00'`);
      }
      // Privilege escalation must stop before returning a connection to
      // the transaction executor, even though the LOGIN has NOINHERIT.
      await pool.query(`grant myeongha_api_executor to ${login}`);
      try{
        await expect(privatePool.connect()).rejects.toBeInstanceOf(
          SeyeonG5PrivateCommerceBoundaryErrorV1);
      }finally{
        await pool.query(`revoke myeongha_api_executor from ${login}`);
      }
      expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:privatePool,mode:'apply',maxBatch:1,testAsOf:asOf,
      })).toEqual({status:'completed',found:1,settled:1,failed:0});
      expect(await creditState(f)).toEqual({state:'settled',available:'40',credits:'10'});
      const {rows:[ack]}=await pool.query(
        'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
        [f.attempt]);
      expect(ack.received).toEqual(received);
      expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
        privateCreditPool:privatePool,mode:'preview',maxBatch:1,testAsOf:asOf,
      })).toEqual({status:'preview',found:0,settled:0,failed:0});
    }finally{
      if(privatePool)await privatePool.close();
      else await native?.end();
      if(created)await pool.query(`drop role if exists ${login}`);
    }
  });

  it('G5 real original Fetch/256-bit proof/HTTP ACK settles 10 credits exactly once',async()=>{
    await installDisposableG5Credit();
    // Existing S0 tests already own fixture 13; isolate the Commerce E2E.
    const f=await prepare(17,{summary:'Synthetic approved original Memory for credit ACK'});
    await reserveFirstPositive(f);
    const response=await fetchReply(f);
    expect(response.status).toBe(200);
    const payload=await response.json();
    const receipt=payload.data.deliveryReceipt as {attemptId:string;challenge:string};
    const proof=receiptProof(payload.data.assistantText as string,receipt.challenge);
    expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
    const {rows:[pre]}=await pool.query(
      'select seyeon_positive_delivery_received_at from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(pre.seyeon_positive_delivery_received_at).toBeNull();
    expect((await creditReceipt(f,f.attempt,'0'.repeat(64))).status).toBe(503);
    expect((await creditReceipt(f,uuid(17,999),proof)).status).toBe(503);
    expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
    expect((await creditReceipt(f,receipt.attemptId,proof)).status).toBe(200);
    expect((await creditReceipt(f,receipt.attemptId,proof)).status).toBe(200);
    expect(await creditState(f)).toEqual({state:'settled',available:'40',credits:'10'});
    const {rows:[confirmed]}=await pool.query(
      'select seyeon_positive_delivery_received_at from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(confirmed.seyeon_positive_delivery_received_at).not.toBeNull();
  });

  it('G5 durable receipt survives Commerce DB outage; retry settles same 10',async()=>{
    // Existing S0 tests already own fixture 14; never overwrite originals.
    const f=await prepare(18,{summary:'Synthetic approved original Memory for recovery'});
    await reserveFirstPositive(f);
    const response=await fetchReply(f);
    expect(response.status).toBe(200);
    const payload=await response.json();
    const receipt=payload.data.deliveryReceipt as {attemptId:string;challenge:string};
    const proof=receiptProof(payload.data.assistantText as string,receipt.challenge);
    const unavailablePrivatePool=Object.freeze({
      connect:async()=>{throw Error('synthetic isolated private Commerce outage');},
    }) as PostgresSubjectPoolV1;
    const failed=await creditReceipt(f,receipt.attemptId,proof,unavailablePrivatePool);
    expect(failed.status).toBe(503);
    expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
    const {rows:[committed]}=await pool.query(
      'select seyeon_positive_delivery_received_at from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(committed.seyeon_positive_delivery_received_at).not.toBeNull();
    expect((await creditReceipt(f,receipt.attemptId,proof)).status).toBe(200);
    expect((await creditReceipt(f,receipt.attemptId,proof)).status).toBe(200);
    expect(await creditState(f)).toEqual({state:'settled',available:'40',credits:'10'});
  });

  it('G5 recovers only aged DB-confirmed received replies; skips unreceived and double charge',async()=>{
    const received=await prepare(19,{summary:'Isolated recovery receipt original'});
    await reserveFirstPositive(received);
    const response=await fetchReply(received);
    expect(response.status).toBe(200);
    const data=(await response.json()).data;
    const receipt=data.deliveryReceipt as {attemptId:string;challenge:string};
    const proof=receiptProof(data.assistantText as string,receipt.challenge);

    const unavailable=Object.freeze({
      connect:async()=>{throw Error('disposable Commerce outage before settlement');},
    }) as PostgresSubjectPoolV1;
    expect((await creditReceipt(received,receipt.attemptId,proof,unavailable)).status).toBe(503);
    expect(await creditState(received)).toEqual({
      state:'reserved',available:'40',credits:'10',
    });

    const unreceived=await prepare(20,{summary:'Unreceived original must never be charged'});
    await reserveFirstPositive(unreceived);
    const pendingReply=await fetchReply(unreceived);
    expect(pendingReply.status).toBe(200);
    // Deliberately never submit its browser-issued challenge.

    // The bounded recovery catalog intentionally ignores fresh receipt ACKs.
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'apply',maxBatch:1,
    })).toEqual({status:'empty',found:0,settled:0,failed:0});

    // Never rewrite immutable receipt evidence; preview then apply with
    // the same read-only clock on the exact disposable PostgreSQL clone.
    const testAsOf=new Date(Date.now()+10*60_000);
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'preview',maxBatch:1,testAsOf,
    })).toEqual({status:'preview',found:1,settled:0,failed:0});
    expect(await creditState(received)).toEqual({
      state:'reserved',available:'40',credits:'10',
    });
    expect(await creditState(unreceived)).toEqual({
      state:'reserved',available:'40',credits:'10',
    });
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'apply',maxBatch:1,testAsOf,
    })).toEqual({status:'completed',found:1,settled:1,failed:0});
    expect(await creditState(received)).toEqual({
      state:'settled',available:'40',credits:'10',
    });
    expect(await creditState(unreceived)).toEqual({
      state:'reserved',available:'40',credits:'10',
    });
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'apply',maxBatch:1,
    })).toEqual({status:'empty',found:0,settled:0,failed:0});
  });

  it('G5 account deletion started after real S0 ACK blocks preview, apply and direct private settlement',async()=>{
    const f=await prepare(21,{summary:'Account deletion race after valid S0 delivery'});
    await reserveFirstPositive(f);
    const response=await fetchReply(f);
    expect(response.status).toBe(200);
    const data=(await response.json()).data;
    const receipt=data.deliveryReceipt as {attemptId:string;challenge:string};
    const proof=receiptProof(data.assistantText as string,receipt.challenge);

    // Persist the real original ACK, then simulate a Commerce outage before settlement.
    const unavailable=Object.freeze({
      connect:async()=>{throw Error('isolated Commerce outage before account deletion');},
    }) as PostgresSubjectPoolV1;
    expect((await creditReceipt(f,receipt.attemptId,proof,unavailable)).status).toBe(503);
    const {rows:[originalAck]}=await pool.query(
      'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
      [f.attempt],
    );
    expect(originalAck.received).not.toBeNull();
    expect(await creditState(f)).toEqual({
      state:'reserved',available:'40',credits:'10',
    });

    // A preview is not an authorization that survives a Member deletion request.
    const testAsOf=new Date(Date.now()+10*60_000);
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'preview',maxBatch:1,testAsOf,
    })).toEqual({status:'preview',found:1,settled:0,failed:0});

    // Use the actual account-deletion start DB authority, not a fabricated status.
    const {rows:[deletion]}=await pool.query(
      'select * from public.cmd_start_account_deletion_v1($1::uuid,$2::uuid,$3::text,$4::uuid)',
      [f.subject,uuid(26,21),'g5-account-deletion-original-21',uuid(27,21)],
    );
    expect(deletion).toMatchObject({deletion_job_status:'running',replayed:false});
    const {rows:[member]}=await pool.query(
      'select status from public.subjects where id=$1',[f.subject],
    );
    expect(member.status).toBe('deletion_pending');

    // Both recovery modes re-query the current DB original and exclude this Member.
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'preview',maxBatch:1,testAsOf,
    })).toEqual({status:'preview',found:0,settled:0,failed:0});
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'apply',maxBatch:1,testAsOf,
    })).toEqual({status:'empty',found:0,settled:0,failed:0});

    // Even a previously previewed Attempt, submitted directly using the
    // internal Commerce role, must re-check deletion_pending under row lock.
    await expect(executePostgresCommerceInternalTransactionV1({
      pool:privateG5Pool(),
      execute:({client})=>client.query(
        'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid)',
        [f.attempt],
      ),
    })).rejects.toThrow('active original Member');

    // Account-deletion-pending Members cannot use the ordinary credit balance
    // query either. Inspect the disposable Owner ledger directly, without
    // restoring Member status or bypassing the original receipt guard.
    await expect(pool.query(
      'select * from public.internal_qry_chat_credit_balance_v1($1::uuid)',
      [f.subject],
    )).rejects.toThrow('not an active Subject');
    const {rows:[retainedLedger]}=await pool.query(
      `select r.state,
         (select coalesce(sum(a.credits),0) from public.chat_credit_turn_allocations_v1 a
          where a.reservation_id=r.id)::text as credits,
         (select coalesce(sum(l.credits_remaining),0) from public.chat_credit_lots_v1 l
          where l.subject_id=r.subject_id)::text as remaining
       from public.chat_credit_turn_reservations_v1 r
       where r.subject_id=$1 and r.client_turn_id=$2`,
      [f.subject,uuid(30,f.n)],
    );
    expect(retainedLedger).toEqual({state:'reserved',credits:'10',remaining:'40'});
    const {rows:[stillOriginal]}=await pool.query(
      'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
      [f.attempt],
    );
    expect(stillOriginal.received).toEqual(originalAck.received);
  });

  // Two real isolated PostgreSQL connections are required; mocked races do not
  // prove the Subject lock serializes account deletion and private settlement.
  async function g5StrandedRaceOriginal(n:number){
    const f=await prepare(n,{summary:'G5 deletion versus settlement PG race '+n});
    await reserveFirstPositive(f);
    const issued=await fetchReply(f);
    expect(issued.status).toBe(200);
    const data=(await issued.json()).data;
    const receipt=data.deliveryReceipt as {attemptId:string;challenge:string};
    const proof=receiptProof(data.assistantText as string,receipt.challenge);
    const unavailable=Object.freeze({
      connect:async()=>{throw Error('isolated G5 race Commerce failure');},
    }) as PostgresSubjectPoolV1;
    expect((await creditReceipt(f,receipt.attemptId,proof,unavailable)).status).toBe(503);
    expect(await creditState(f)).toEqual({state:'reserved',available:'40',credits:'10'});
    const {rows:[ack]}=await pool.query(
      'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(ack.received).not.toBeNull();
    return {f,received:ack.received};
  }

  async function waitForG5RowLock(pid:number){
    for(let i=0;i<100;i++){
      const {rows:[status]}=await pool.query(
        'select wait_event_type as waiting from pg_stat_activity where pid=$1 and datname=current_database()',
        [pid]);
      if(status?.waiting==='Lock')return;
      await new Promise(resolve=>setTimeout(resolve,18));
    }
    throw Error('G5 race must exhibit actual PostgreSQL row-lock wait');
  }

  async function g5OwnerLedger(f:Awaited<ReturnType<typeof prepare>>){
    const {rows:[r]}=await pool.query(`select r.state,
      (select coalesce(sum(a.credits),0) from public.chat_credit_turn_allocations_v1 a
       where a.reservation_id=r.id)::text as credits,
      (select coalesce(sum(l.credits_remaining),0) from public.chat_credit_lots_v1 l
       where l.subject_id=r.subject_id)::text as remaining,
      (select count(*)::int from public.chat_credit_turn_reservations_v1 x
       where x.subject_id=r.subject_id and x.client_turn_id=r.client_turn_id) as reservations
      from public.chat_credit_turn_reservations_v1 r
      where r.subject_id=$1 and r.client_turn_id=$2`,
      [f.subject,uuid(30,f.n)]);
    return r;
  }
  const deleteG5Account=(f:Awaited<ReturnType<typeof prepare>>,client:{
    query:(sql:string,values?:unknown[])=>Promise<unknown>,
  })=>client.query(
    'select * from public.cmd_start_account_deletion_v1($1::uuid,$2::uuid,$3::text,$4::uuid)',
    [f.subject,uuid(26,f.n),'g5-concurrent-account-deletion-'+f.n,uuid(27,f.n)],
  );

  it('G5 two-session race: settlement commits first, deletion waits then excludes future recovery',async()=>{
    const {f,received}=await g5StrandedRaceOriginal(22);
    const settlement=await pool.connect();
    const deletion=await pool.connect();
    let settledOpen=false,deleteOpen=false;
    let pendingDeletion:Promise<{ok:boolean;error?:unknown}>|undefined;
    try{
      await settlement.query('BEGIN');settledOpen=true;
      await settlement.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
      const {rows:[result]}=await settlement.query(
        'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as state',
        [f.attempt]);
      expect(result.state).toBe('settled');
      // Settlement holds the canonical Subject lock until COMMIT.
      await deletion.query('BEGIN');deleteOpen=true;
      const {rows:[p]}=await deletion.query('select pg_backend_pid() as pid');
      pendingDeletion=deleteG5Account(f,deletion)
        .then(()=>({ok:true}),error=>({ok:false,error}));
      await waitForG5RowLock(p.pid);
      await settlement.query('COMMIT');settledOpen=false;
      expect((await pendingDeletion).ok).toBe(true);
      await deletion.query('COMMIT');deleteOpen=false;
    }finally{
      if(settledOpen)await settlement.query('ROLLBACK');
      if(pendingDeletion)await pendingDeletion;
      if(deleteOpen)await deletion.query('ROLLBACK');
      settlement.release();deletion.release();
    }
    expect(await g5OwnerLedger(f)).toEqual({
      state:'settled',credits:'10',remaining:'40',reservations:1,
    });
    const {rows:[member]}=await pool.query(
      'select status from public.subjects where id=$1',[f.subject]);
    expect(member.status).toBe('deletion_pending');
    const {rows:[ack]}=await pool.query(
      'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(ack.received).toEqual(received);
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'apply',maxBatch:1,
      testAsOf:new Date(Date.now()+10*60_000),
    })).toEqual({status:'empty',found:0,settled:0,failed:0});
  });

  it('G5 two-session race: deletion commits first, private settlement waits then rejects',async()=>{
    const {f,received}=await g5StrandedRaceOriginal(23);
    const settlement=await pool.connect();
    const deletion=await pool.connect();
    let settledOpen=false,deleteOpen=false;
    let pendingSettlement:Promise<{ok:boolean;error?:unknown}>|undefined;
    try{
      await deletion.query('BEGIN');deleteOpen=true;
      await deleteG5Account(f,deletion);
      // Deletion's canonical Subject status update is uncommitted, but the
      // Subject row lock must block even the privileged Commerce settlement.
      await settlement.query('BEGIN');settledOpen=true;
      await settlement.query('SET LOCAL ROLE myeongha_commerce_internal_executor');
      const {rows:[p]}=await settlement.query('select pg_backend_pid() as pid');
      pendingSettlement=settlement.query(
        'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as state',
        [f.attempt],
      ).then(()=>({ok:true}),error=>({ok:false,error}));
      await waitForG5RowLock(p.pid);
      await deletion.query('COMMIT');deleteOpen=false;
      const settled=await pendingSettlement;
      expect(settled.ok).toBe(false);
      expect(String((settled.error as Error)?.message)).toContain('active original Member');
    }finally{
      if(deleteOpen)await deletion.query('ROLLBACK');
      if(pendingSettlement)await pendingSettlement;
      if(settledOpen)await settlement.query('ROLLBACK');
      settlement.release();deletion.release();
    }
    expect(await g5OwnerLedger(f)).toEqual({
      state:'reserved',credits:'10',remaining:'40',reservations:1,
    });
    const {rows:[member]}=await pool.query(
      'select status from public.subjects where id=$1',[f.subject]);
    expect(member.status).toBe('deletion_pending');
    const {rows:[ack]}=await pool.query(
      'select seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',
      [f.attempt]);
    expect(ack.received).toEqual(received);
    expect(await recoverSeyeonG5ReceivedCreditsCandidateV1({
      privateCreditPool:privateG5Pool(),mode:'preview',maxBatch:1,
      testAsOf:new Date(Date.now()+10*60_000),
    })).toEqual({status:'preview',found:0,settled:0,failed:0});
  });

  } // End Actions-only credit integration; restored-backup S0 still runs unchanged.

  it('stops model/write/Reveal admission without deleting data or removing consent withdrawal', async () => {
    const { rows: [before] } = await pool.query('select count(*)::int as n from public.memory_items');
    await pool.query(readFileSync(new URL('../scripts/operations/seyeon-security-s0/stop-positive-use.sql', import.meta.url), 'utf8'));
    const { rows: [state] } = await pool.query(`select
      not exists(select 1 from public.seyeon_positive_source_type_registry_v1 where enabled or writable_enabled) as stopped,
      not has_function_privilege('myeongha_api_executor',
        'public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') as no_reveal,
      has_function_privilege('myeongha_api_executor',
        'seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)','EXECUTE') as can_revoke,
      (select count(*)::int from public.memory_items) as n`);
    expect(state).toEqual({ stopped: true, no_reveal: true, can_revoke: true, n: before.n });
  });
});
