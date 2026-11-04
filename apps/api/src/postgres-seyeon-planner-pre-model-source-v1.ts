// Watchtower-Track: security
// UC-06: exact committed Member/User/Se-yeon source verification before
// invoking any metered Planner. An app snapshot is NOT source authority.
// This is disposable S0 DB-only and does not enable a production model.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL=`
select source_ready as "sourceReady"
from seyeon_private.qry_seyeon_planner_pre_model_source_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text
)`.trim();

export const SEYEON_PLANNER_PRE_MODEL_SOURCE_V1=Object.freeze({
  dbFunction:'seyeon_private.qry_seyeon_planner_pre_model_source_v1',
  productionMounted:false,
  ordinaryApiExecuteGranted:false,
  returnsOriginalText:false,
  beforePaidProvider:true,
} as const);

export class SeyeonPlannerPreModelSourceHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_PRE_MODEL_SOURCE_HOLD' as const;
  constructor() {
    super('The exact committed Planner source is not verified by its DB owner.');
    this.name='SeyeonPlannerPreModelSourceHoldV1';
  }
}

/** Verify identity and both original texts inside the canonical Member
 * transaction; return no personal text or persisted Grant to Node.
 * Post-model Producer must recheck origin to close any intervening race.
 */
export async function verifySeyeonPlannerPreModelSourceV1(
  client:PostgresTransactionQueryV1,
  input:Readonly<{
    canonicalMemberSubjectId:string;
    turnId:string;
    userMessageId:string;
    userText:string;
    assistantMessageId:string;
    assistantText:string;
  }>,
):Promise<void>{
  if(!client || typeof client.query!=='function' ||
     !UUID.test(input.canonicalMemberSubjectId) ||
     !UUID.test(input.turnId) || !UUID.test(input.userMessageId) ||
     !UUID.test(input.assistantMessageId) ||
     input.userMessageId===input.assistantMessageId ||
     typeof input.userText!=='string' || !input.userText.trim() ||
     typeof input.assistantText!=='string' || !input.assistantText.trim() ||
     Buffer.byteLength(input.userText,'utf8')>65_536 ||
     Buffer.byteLength(input.assistantText,'utf8')>65_536){
    throw new SeyeonPlannerPreModelSourceHoldV1();
  }
  const result=await client.query<{sourceReady:unknown}>(SQL,[
    input.canonicalMemberSubjectId,input.turnId,input.userMessageId,
    input.assistantMessageId,input.userText,input.assistantText,
  ]);
  if(result.rows.length!==1||result.rows[0]?.sourceReady!==true){
    throw new SeyeonPlannerPreModelSourceHoldV1();
  }
}
