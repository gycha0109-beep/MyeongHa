// Watchtower-Track: security
// UC-07 discard/session-only: erase pending candidate at DB Owner. The
// conversation itself remains governed by existing Chat permissions.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { PlannerMemoryDecisionPlanV1 }
  from './seyeon-planner-memory-decision-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL = `select
  proposal_id::text as "proposalId",
  decision,
  persisted,
  grant_count as "grantCount",
  payload_purged as "payloadPurged"
from seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(
  $1::uuid,$2::uuid,$3::text
)`.trim();

export const SEYEON_PLANNER_NON_DURABLE_DB_V1 = Object.freeze({
  dbFunction:'seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1',
  ordinaryApiExecuteGranted:false,
  productionMounted:false,
  durableMemoriesCreated:0,
  grantsCreated:0,
} as const);

export class SeyeonPlannerNonDurableDecisionHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_NON_DURABLE_HOLD' as const;
  constructor(){
    super('Exact non-durable Member Planner decision unavailable.');
    this.name='SeyeonPlannerNonDurableDecisionHoldV1';
  }
}

export async function resolveSeyeonNonDurablePlannerProposalV1(input:Readonly<{
  client:PostgresTransactionQueryV1;
  canonicalMemberSubjectId:string;
  plan:Readonly<PlannerMemoryDecisionPlanV1>;
}>):Promise<Readonly<{
  proposalId:string;
  decision:'session_only'|'discard';
  status:'resolved';
  persisted:false;
  grantCount:0;
  payloadPurged:true;
}>> {
  const {canonicalMemberSubjectId,plan}=input;
  if(!UUID.test(canonicalMemberSubjectId)||!plan||!UUID.test(plan.proposalId)||
     (plan.choice!=='session_only'&&plan.choice!=='discard')||
     plan.expectedGrantCount!==0||!plan.requiresPayloadErasure||
     plan.resolution.durableRecord!==null ||
     plan.resolution.grants.length!==0 ||
     plan.resolution.resolution!==(plan.choice==='discard'?'reject':'session_only')) {
    throw new SeyeonPlannerNonDurableDecisionHoldV1();
  }
  const rows=await input.client.query<{
    proposalId:unknown;decision:unknown;persisted:unknown;
    grantCount:unknown;payloadPurged:unknown;
  }>(SQL,[canonicalMemberSubjectId,plan.proposalId,plan.choice]);
  const item=rows.rows[0];
  if(rows.rows.length!==1||item?.proposalId!==plan.proposalId||
     item.decision!==plan.choice||item.persisted!==false||
     item.grantCount!==0||item.payloadPurged!==true) {
    throw new SeyeonPlannerNonDurableDecisionHoldV1();
  }
  return Object.freeze({
    proposalId:plan.proposalId,decision:plan.choice,
    status:'resolved' as const,persisted:false as const,
    grantCount:0 as const,payloadPurged:true as const,
  });
}
