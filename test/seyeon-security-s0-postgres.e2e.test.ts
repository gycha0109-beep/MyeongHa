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
import { handleSeyeonFirstPositiveMemoryDirectNodeHttpV1 } from '../apps/api/src/seyeon-first-positive-memory-node-http-ingress-v1.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';

const enabled = process.env.SEYEON_SECURITY_S0_REAL_PG === '1';
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
  let subjectPool: PostgresSubjectPoolV1;
  beforeAll(async () => {
    const db = process.env.PGDATABASE ?? '';
    if (!['localhost', '127.0.0.1', '::1'].includes(process.env.PGHOST ?? '') ||
        !(db === 'myeongha_seyeon_security_s0_test' ||
          (process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' &&
           process.env.DB_SUITE === 'postgres17' && /^myeongha_ci_case_[0-9]+$/u.test(db)))) {
      throw Error('S0 real tests require the named disposable database.');
    }
    pool = new Pool({
      host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432),
      user: 'postgres', database: db, password: process.env.PGPASSWORD,
      ssl: false, max: 4, statement_timeout: 5000,
    });
    subjectPool = pool as unknown as PostgresSubjectPoolV1;
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
        uuid,uuid,uuid) to myeongha_api_executor;`);
  });
  afterAll(async () => { await pool?.end(); });

  async function prepare(n: number) {
    const auth = uuid(10, n), subject = uuid(11, n), thread = uuid(14, n);
    const turn = uuid(16, n), attempt = uuid(17, n), user = uuid(18, n);
    const assistant = uuid(19, n), memory = uuid(24, n), grant = uuid(25, n);
    const adapt = (sql: string) => sql.replaceAll('000000000001', String(n).padStart(12, '0'))
      .replaceAll('first-zero-test-v1', 'first-zero-test-v1-' + n)
      .replaceAll('first-zero-test-release', 'first-zero-test-release-' + n)
      .replaceAll('first-zero-disposable-v1', uuid(30, n))
      .replaceAll("repeat('a',64)", "repeat('" + n.toString(16) + "',64)");
    await pool.query(adapt(baseline.slice(0, seedEnd)));
    await pool.query(`insert into public.memory_items(
      id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,created_at)
      values($1,$2,'conversation_recall','v1','{"summary":"synthetic approved recall"}','user_approved','seyeon',clock_timestamp());
    `.trim(), [memory, subject]);
    await pool.query(`insert into public.record_access_grants(
      id,subject_id,memory_item_id,grantee_character_id,grant_reason,granted_at)
      values($1,$2,$3,'seyeon','user_choice',clock_timestamp())`, [grant, subject, memory]);
    const { rows: [raw] } = await pool.query(`select
      'sha256:pg-jsonb:v1:'||encode(sha256(convert_to(content_jsonb::text,'UTF8')),'hex') as digest
      from public.memory_items where id=$1`, [memory]);
    const source = {
      recordKind: 'memory' as const, recordId: memory, grantId: grant,
      recordType: 'conversation_recall', schemaVersion: 'v1',
      rawRecordDigest: hash({ summary: 'synthetic approved recall' }),
      rawRecordPgDigest: raw.digest as string,
      projectedMemoryDigest: hash({ memoryId: memory, summary: 'synthetic approved recall' }),
      projectorVersion: 'seyeon-conversation-recall-projector-v1',
    };
    const selectionDigest = hash([source]), contextDigest = hash({ synthetic: turn });
    const evidence = { kind: 'member' as const, verifiedAuthUserId: auth };
    const run = <T>(execute: Parameters<typeof executePostgresSubjectTransactionV1<T>>[0]['execute']) =>
      executePostgresSubjectTransactionV1({ pool: subjectPool, verifiedEvidence: evidence, execute });
    await run(({ client }) => createSeyeonPositiveS0OwnerDbPortsV1(client).pinBeforeModel({
      subjectId: subject, threadId: thread, turnId: turn, attemptId: attempt,
      originalMemoryId: memory, originalGrantId: grant, recordType: source.recordType,
      schemaVersion: source.schemaVersion, projectorVersion: source.projectorVersion,
      selectedSources: [source], selectedSourcesDigest: selectionDigest,
      projectedMemoryDigest: source.projectedMemoryDigest,
      finalModelContextDigest: contextDigest, expectedOriginalPgDigest: source.rawRecordPgDigest,
    }));
    const generation = adapt(baseline.slice(generationStart, generationEnd))
      .replaceAll("->'zeroProof'", "->'positiveProof'");
    await pool.query(`BEGIN; set local myeongha.subject_id='${subject}';\n${generation}\nCOMMIT;`);
    const snapshot = {
      schemaVersion: 'seyeon-post-turn-analysis-snapshot-v1', mode: 'OFF',
      turnId: turn, userMessageId: user, assistantMessageId: assistant,
      preparedAt: '2026-10-24T00:00:00.000Z', productionAuthorityRef: 'production:synthetic-test',
      interpretation: {}, envelope: { utterance: 'DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK' },
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
    return { n, auth, subject, thread, turn, attempt, user, assistant, memory, grant, evidence, run, commitInput, commit, locked, revoke };
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
                threadCharacterId: 'seyeon', turnState: 'received', replayed: false,
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
