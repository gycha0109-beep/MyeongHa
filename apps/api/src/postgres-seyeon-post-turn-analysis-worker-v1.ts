import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  SeyeonPostTurnAnalysisClaimV1,
  SeyeonPostTurnAnalysisOutboxPortV1,
} from './seyeon-post-turn-analysis-worker-v1.js';

type Row = Readonly<Record<string, unknown>>;

export const POSTGRES_SEYEON_POST_TURN_ANALYSIS_LOOKUP_BINDING_V1 =
  'public.qry_seyeon_post_turn_analysis_job_v1' as const;
export const POSTGRES_SEYEON_POST_TURN_ANALYSIS_CLAIM_BINDING_V1 =
  'public.cmd_claim_seyeon_post_turn_analysis_v1' as const;
export const POSTGRES_SEYEON_POST_TURN_ANALYSIS_COMPLETE_BINDING_V1 =
  'public.cmd_complete_seyeon_post_turn_analysis_v1' as const;

const FIND_SQL = `
select
  outbox_event_id::text as "outboxEventId",
  status,
  lease_expires_at::text as "leaseExpiresAt"
from public.qry_seyeon_post_turn_analysis_job_v1(
  $1::uuid,$2::uuid
)
`.trim();

const CLAIM_SQL = `
select
  outbox_event_id::text as "outboxEventId",
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  user_message_id::text as "userMessageId",
  user_text as "userText",
  assistant_message_id::text as "assistantMessageId",
  assistant_text as "assistantText",
  committed_at::text as "committedAt",
  snapshot_jsonb as "snapshotJsonb",
  snapshot_hash as "snapshotHash",
  status,
  lock_owner as "lockOwner",
  lease_expires_at::text as "leaseExpiresAt",
  reclaimed
from public.cmd_claim_seyeon_post_turn_analysis_v1(
  $1::uuid,$2::uuid,$3::text,$4::timestamptz
)
`.trim();

const COMPLETE_SQL = `
select
  outbox_event_id::text as "outboxEventId",
  status,
  processed_at::text as "processedAt",
  replayed
from public.cmd_complete_seyeon_post_turn_analysis_v1(
  $1::uuid,$2::uuid,$3::text
)
`.trim();

function text(name:string,value:unknown):string {
  if(typeof value!=='string'||value.trim().length===0){
    throw new Error('Se-yeon post-turn PostgreSQL '+name+' is invalid.');
  }
  return value.trim();
}

function nullableInstant(name:string,value:unknown):string|null {
  return value===null ? null : instant(name,value);
}

function instant(name:string,value:unknown):string {
  const raw=text(name,value);
  const parsed=Date.parse(raw);
  if(!Number.isFinite(parsed)){
    throw new Error('Se-yeon post-turn PostgreSQL '+name+' is invalid.');
  }
  return new Date(parsed).toISOString();
}

function bool(name:string,value:unknown):boolean {
  if(typeof value!=='boolean'){
    throw new Error('Se-yeon post-turn PostgreSQL '+name+' is invalid.');
  }
  return value;
}

class PostgresSeyeonPostTurnAnalysisOutboxPortV1
implements SeyeonPostTurnAnalysisOutboxPortV1 {
  constructor(private readonly client:PostgresTransactionQueryV1){}

  async findByTurn(
    input:Parameters<SeyeonPostTurnAnalysisOutboxPortV1['findByTurn']>[0],
  ){
    const result=await this.client.query<Row>(FIND_SQL,[
      input.subjectId,
      input.turnId,
    ]);
    return Object.freeze(result.rows.map(row=>Object.freeze({
      outboxEventId:text('outbox event id',row.outboxEventId),
      status:text('status',row.status),
      leaseExpiresAt:nullableInstant('lease expiry',row.leaseExpiresAt),
    })));
  }

  async claim(
    input:Parameters<SeyeonPostTurnAnalysisOutboxPortV1['claim']>[0],
  ):Promise<readonly SeyeonPostTurnAnalysisClaimV1[]> {
    const result=await this.client.query<Row>(CLAIM_SQL,[
      input.subjectId,
      input.outboxEventId,
      input.lockOwner,
      input.leaseExpiresAt,
    ]);
    return Object.freeze(result.rows.map(row=>Object.freeze({
      outboxEventId:text('outbox event id',row.outboxEventId),
      turnId:text('turn id',row.turnId),
      attemptId:text('attempt id',row.attemptId),
      userMessageId:text('user message id',row.userMessageId),
      userText:text('user text',row.userText),
      assistantMessageId:text('assistant message id',row.assistantMessageId),
      assistantText:text('assistant text',row.assistantText),
      committedAt:instant('committed at',row.committedAt),
      snapshotJsonb:row.snapshotJsonb,
      snapshotHash:text('snapshot hash',row.snapshotHash),
      status:text('status',row.status),
      lockOwner:text('lock owner',row.lockOwner),
      leaseExpiresAt:instant('lease expiry',row.leaseExpiresAt),
      reclaimed:bool('reclaimed flag',row.reclaimed),
    })));
  }

  async complete(
    input:Parameters<SeyeonPostTurnAnalysisOutboxPortV1['complete']>[0],
  ){
    const result=await this.client.query<Row>(COMPLETE_SQL,[
      input.subjectId,
      input.outboxEventId,
      input.lockOwner,
    ]);
    return Object.freeze(result.rows.map(row=>Object.freeze({
      outboxEventId:text('outbox event id',row.outboxEventId),
      status:text('status',row.status),
      processedAt:instant('processed at',row.processedAt),
      replayed:bool('completion replay flag',row.replayed),
    })));
  }
}

export function createPostgresSeyeonPostTurnAnalysisOutboxPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonPostTurnAnalysisOutboxPortV1 {
  return new PostgresSeyeonPostTurnAnalysisOutboxPortV1(client);
}
