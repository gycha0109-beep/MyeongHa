import { describe, expect, it, vi } from 'vitest';
import {
  readSeyeonAiModelCostsV1,
  readSeyeonAiUnsettledCallsV1,
} from '../apps/api/src/seyeon-ai-cost-observability-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const subjectId='11111111-1111-4111-8111-111111111111';
const turnId='22222222-2222-4222-8222-222222222222';
const callId='33333333-3333-4333-8333-333333333333';

describe('Se-yeon model cost observability (offline)',()=>{
  it('returns per-model confirmed and unresolved costs without zero-filling unknown',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[
      {providerKey:'openai-responses',modelKey:'a',callCount:'2',
        unsettledCalls:'1',knownCostMicroUsd:'185',
        unknownCostCalls:'1',totalEstimatedCostMicroUsd:null},
      {providerKey:'openai-responses',modelKey:'b',callCount:'1',
        unsettledCalls:'0',knownCostMicroUsd:'50',
        unknownCostCalls:'0',totalEstimatedCostMicroUsd:'50'},
    ]});
    const client={query} as unknown as PostgresTransactionQueryV1;
    const result=await readSeyeonAiModelCostsV1(client,subjectId,turnId);
    expect(result).toEqual([
      {providerKey:'openai-responses',modelKey:'a',callCount:2,
        unsettledCalls:1,knownCostMicroUsd:185n,
        unknownCostCalls:1,totalEstimatedCostMicroUsd:null},
      {providerKey:'openai-responses',modelKey:'b',callCount:1,
        unsettledCalls:0,knownCostMicroUsd:50n,
        unknownCostCalls:0,totalEstimatedCostMicroUsd:50n},
    ]);
    expect(query.mock.calls[0]![0]).toContain('qry_seyeon_ai_model_cost_v1');
    expect(query.mock.calls[0]![1]).toEqual([subjectId,turnId]);
  });

  it('only exposes bounded pending-call metadata, not prompts or responses',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{
      callId,providerKey:'openai-responses',modelKey:'a',
      purpose:'event_extraction',startedAt:'2026-10-09 12:00:00+00',
    }]});
    const client={query} as unknown as PostgresTransactionQueryV1;
    expect(await readSeyeonAiUnsettledCallsV1(client,subjectId,turnId)).toEqual([{
      callId,providerKey:'openai-responses',modelKey:'a',
      purpose:'event_extraction',startedAt:'2026-10-09 12:00:00+00',
    }]);
    expect(query.mock.calls[0]![0]).toContain('qry_seyeon_ai_unsettled_calls_v1');
    expect(JSON.stringify(query.mock.calls)).not.toContain('prompt');
  });

  it('rejects inconsistent call-count partitions and invalid subject IDs',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{
      providerKey:'openai-responses',modelKey:'a',callCount:'1',
      unsettledCalls:'2',knownCostMicroUsd:'0',unknownCostCalls:'1',
      totalEstimatedCostMicroUsd:null,
    }]});
    const client={query} as unknown as PostgresTransactionQueryV1;
    await expect(readSeyeonAiModelCostsV1(client,subjectId,turnId))
      .rejects.toThrow('inconsistent call counts');
    await expect(readSeyeonAiModelCostsV1(client,'wrong-subject',turnId))
      .rejects.toThrow('invalid subjectId');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
