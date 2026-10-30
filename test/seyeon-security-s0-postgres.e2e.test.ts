// Watchtower-Track: security
// Actual production-table SQL and existing TS ports; synthetic identities only.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
import { createSeyeonFirstPositiveMemoryLockedReadV1 } from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import { revokeSeyeonOriginalMemoryGrantAndAckV1 } from '../apps/api/src/seyeon-original-grant-revoke-ack-v1.js';
import { acceptSeyeonPrivateConversationRecallProposalV1 } from '../apps/api/src/postgres-seyeon-private-memory-proposal-accept-v1.js';
import { createSeyeonOwnedOriginalGrantV1 } from '../apps/api/src/postgres-seyeon-owned-original-grant-v1.js';
import { readSeyeonPendingPlannerMemoryDecisionSourceV1 } from '../apps/api/src/postgres-seyeon-planner-memory-decision-source-v1.js';
import { planSeyeonPlannerMemoryDecisionV1 } from '../apps/api/src/seyeon-planner-memory-decision-v1.js';
import { commitSeyeonSingleCharacterPlannerGrantDecisionV1 } from '../apps/api/src/seyeon-planner-memory-decision-commit-v1.js';
import { handleSeyeonFirstPositiveMemoryDirectNodeHttpV1 } from '../apps/api/src/seyeon-first-positive-memory-node-http-ingress-v1.js';
import { handleSeyeonFirstPositiveMemoryFetchV1,handleSeyeonPositiveReplyReceiptV1 } from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
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
      grant execute on function public.cmd_issue_seyeon_positive_first_reply_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea),
        seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text),
        seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)
        to myeongha_api_executor;`);
  });
  afterAll(async () => { await ordinaryPool?.end();await pool?.end(); });

  async function prepare(n: number, virtual?: { summary: string }) {
    const auth = uuid(10, n), subject = uuid(11, n), thread = uuid(14, n);
    const turn = uuid(16, n), attempt = uuid(17, n), user = uuid(18, n);
    const assistant = uuid(19, n), memory = uuid(24, n), grant = uuid(25, n);
    const userText = virtual === undefined ? 'Synthetic first hello' : '내가 주말에 뭐 한다고 했지?';
    const adapt = (sql: string) => sql.replaceAll('000000000001', String(n).padStart(12, '0'))
      .replaceAll('first-zero-test-v1', 'first-zero-test-v1-' + n)
      .replaceAll('first-zero-test-release', 'first-zero-test-release-' + n)
      .replaceAll('first-zero-disposable-v1', uuid(30, n))
      .replaceAll("repeat('a',64)", "repeat('" + n.toString(16) + "',64)")
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
    await run(({ client }) => createSeyeonPositiveS0OwnerDbPortsV1(client).pinBeforeModel({
      subjectId: subject, threadId: thread, turnId: turn, attemptId: attempt,
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
    const f=await prepare(6);
    await f.commit();
    const id=uuid(27,6);
    const insert=`insert into public.memory_proposals(
      id,subject_id,character_id,proposal_kind,record_type,schema_version,
      proposed_value_jsonb,source_turn_id,source_message_id,proposal_dedupe_key,
      status,created_at)
      values($1,$2,'seyeon','memory','conversation_recall','v1',$3::jsonb,
        $4,$5,'seyeon-dialogue-planner:v1','pending',clock_timestamp())`;
    await pool.query(insert,[id,f.subject,JSON.stringify({summary:'synthetic Planner fact'}),f.turn,f.assistant]);
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
    expect(record).toEqual({status:'accepted',body:{summary:'synthetic Planner fact'},grants:1});
    await expect(f.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
      client,canonicalMemberSubjectId:f.subject,proposalId:id,
    }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});

    const other=await prepare(7);
    await other.commit();
    const manual=uuid(27,7);
    await pool.query(insert,[manual,other.subject,JSON.stringify({summary:'synthetic user text'}),
      other.turn,other.user]);
    await expect(other.run(({client})=>readSeyeonPendingPlannerMemoryDecisionSourceV1({
      client,canonicalMemberSubjectId:other.subject,proposalId:manual,
    }))).rejects.toMatchObject({code:'SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE'});
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
    expect((await f.readContext()).retrievedMemories).toHaveLength(0);
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
    expect((await f.readContext()).retrievedMemories).toHaveLength(0);
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
    expect((await f.readContext()).retrievedMemories).toHaveLength(0);
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
