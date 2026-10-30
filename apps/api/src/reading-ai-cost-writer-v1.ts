import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { recordReadingAiCallCostV1, type ReadingAiProviderCallObservationV1 } from './reading-ai-call-cost-v1.js';
import { observeOpenAiReadingCallCostV1 } from './reading-ai-openai-usage-v1.js';
import type { SeyeonAiPriceV1 } from './seyeon-ai-usage-cost-v1.js';

export const READING_AI_COST_WRITER_PRINCIPAL_V1 = 'myeongha_reading_ai_cost_writer_v1' as const;
const VERIFY_ROLE='SELECT current_user::text AS "currentUser"';
type Binding=Pick<ReadingAiProviderCallObservationV1,
  'subjectId'|'readingId'|'executionAttemptId'|'callId'|'observedAt'>;

/** Private, dedicated writer only. No HTTP route and no default runtime mount.
 * Requires a separate PostgreSQL LOGIN bound to the offline private SQL,
 * never a public API executor, browser credential, or generic service_role.
 * Supplier-call coverage must be proved separately; absence of events is
 * NEVER 0 cost. */
export function createReadingAiCostWriterV1(input:{
  readonly pool:PostgresSubjectPoolV1;
}){
  async function record(observation:ReadingAiProviderCallObservationV1){
    const client=await input.pool.connect();let active=false,discard:unknown;
    try {
      await client.query('BEGIN');active=true;
      const identity=await client.query<{currentUser:string}>(VERIFY_ROLE);
      if(identity.rows.length!==1||
        identity.rows[0]?.currentUser!==READING_AI_COST_WRITER_PRINCIPAL_V1)
        throw Error('Dedicated Reading AI cost writer required');
      const receipt=await recordReadingAiCallCostV1(client,observation);
      await client.query('COMMIT');active=false;
      return receipt;
    }catch(error){
      if(active)try{await client.query('ROLLBACK');}catch(failure){discard=failure;}
      throw error;
    }finally{client.release(discard);}
  }
  return Object.freeze({
    record,
    /** Must be invoked from the Saju-owned *actual* OpenAI Responses transport
     * after the provider has answered. It does not accept a consumer Reading
     * response as provider usage. The server owns all Reading/attempt IDs. */
    async recordOpenAi(input:{
      readonly binding:Binding;
      readonly providerResponse:unknown;
      readonly expectedModelKey:string;
      readonly price?:SeyeonAiPriceV1;
    }){
      const event=observeOpenAiReadingCallCostV1(input);
      return record({
        ...input.binding,
        source:event.source,
        providerKey:event.providerKey,
        modelKey:event.modelKey,
        outcome:event.outcome,
        usage:{
          inputTokens:event.inputTokens,outputTokens:event.outputTokens,
          cachedInputTokens:event.cachedInputTokens,reasoningTokens:event.reasoningTokens,
        },
        ...(input.price===undefined?{}:{price:input.price}),
      });
    },
  });
}
