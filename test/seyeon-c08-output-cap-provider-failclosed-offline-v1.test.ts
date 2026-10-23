import { describe, expect, it } from 'vitest';
import {
  createOpenRouterSeyeonEvaluationProviderV1,
  type OpenRouterSeyeonMetricV1,
} from '../apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
// @ts-expect-error Offline scenario MJS has no TS declarations.
import {auditSeyeonStageCompletionCapsOfflineV1} from
  '../scripts/seyeon-c08-stage-cap-feasibility-offline-v1.mjs';

const MODEL = 'z-ai/glm-5.3-flash';
const CAP = 128;
const request = {
  contractVersion: 'seyeon-structured-provider-v2' as const,
  purpose: 'semantic_review' as const,
  instructions: 'Public synthetic structured output offline. No user memory.',
  input: {synthetic: true},
  responseSchema: {
    type:'object',
    additionalProperties:false,
    required:['ok'],
    properties:{ok:{type:'boolean'}},
  },
};
function response(opts: {
  finish?: string;
  content?: string;
  usage?: unknown;
} = {}) {
  const payload: Record<string,unknown> = {
    model: MODEL,
    choices:[{
      index:0,finish_reason:opts.finish ?? 'stop',
      message:{role:'assistant',content:opts.content ?? '{"ok":true}'},
    }],
  };
  if (opts.usage !== null) {
    payload.usage = opts.usage ?? {
      prompt_tokens:50,completion_tokens:80,
      completion_tokens_details:{reasoning_tokens:50},
    };
  }
  return Response.json(payload);
}
function offlineHarness(
  opts:{
    finish?: string;
    content?: string;
    usage?: unknown;
    rejectReserve?: boolean;
  } = {},
) {
  const metrics:OpenRouterSeyeonMetricV1[]=[];
  const bodies:unknown[]=[];
  let dispatches=0;
  const provider = createOpenRouterSeyeonEvaluationProviderV1({
    apiKey:'sk-or-synthetic-no-real-network-testing-key-123456',
    model:MODEL, maxCompletionTokens:CAP,
    providerOnlyTag:'open-inference/fp4',
    beforeDispatch:async ({purpose})=>{
      expect(purpose).toBe('semantic_review');
      if(opts.rejectReserve) {
        const quote=auditSeyeonStageCompletionCapsOfflineV1({
          caps:[128,512,128],
        });
        if(!quote.quote.targetMetUnderStressAssumptions)
          throw new Error('SIMULATED_BUDGET_HOLD');
      }
    },
    afterOutcome:async m=>{metrics.push(m);},
    fetchImpl:async (_url,init)=>{
      dispatches++;
      bodies.push(JSON.parse(String(init.body)));
      return response(opts);
    },
  });
  return {run:()=>provider.generate(request), metrics,bodies,
    get dispatches(){return dispatches;}};
}

describe('C08 staged cap: existing OpenRouter adapter fail-closed without external POST',()=>{
  it('keeps strict format, ZDR and no-fallback with an explicit smaller cap',async()=>{
    const h=offlineHarness();
    await expect(h.run()).resolves.toEqual({ok:true});
    expect(h.dispatches).toBe(1);
    const body=h.bodies[0] as Record<string,any>;
    expect(body.max_completion_tokens).toBe(CAP);
    expect(body.response_format).toMatchObject({
      type:'json_schema',json_schema:{strict:true},
    });
    expect(body.provider).toMatchObject({
      only:['open-inference/fp4'],
      allow_fallbacks:false, require_parameters:true,
      zdr:true,data_collection:'deny',
    });
    expect(h.metrics[0]).toMatchObject({
      outcome:'response_received',completionTokens:80,reasoningTokens:50,
      invoiceReconciled:false,
    });
  });

  it('rejects a length-truncated response before returning candidate text',async()=>{
    const h=offlineHarness({finish:'length',content:'{"ok":'});
    await expect(h.run()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(h.metrics[0]).toMatchObject({
      outcome:'invalid_response',failurePhase:'finish_length',
    });
  });

  it('rejects malformed JSON and non-object schema roots',async()=>{
    for(const content of ['{"ok":', '[]']) {
      const h=offlineHarness({content});
      await expect(h.run()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
      expect(h.metrics[0]?.failurePhase).toBe(
        content==='[]'?'structured_json_root':'structured_json_parse',
      );
    }
  });

  it('rejects unknown usage or malformed reasoning accounting',async()=>{
    const unknown=[null, {prompt_tokens:50,completion_tokens:20,
      completion_tokens_details:{reasoning_tokens:21}}];
    for(const usage of unknown) {
      const h=offlineHarness({usage});
      await expect(h.run()).rejects.toMatchObject({code:'USAGE_UNKNOWN'});
      expect(h.metrics[0]?.outcome).toBe('usage_unknown');
      expect(h.metrics[0]?.failurePhase).toBe(
        usage===null?'usage_missing':'usage_invalid',
      );
    }
  });

  it('rejects reported completion INCLUDING reasoning above configured cap',async()=>{
    const h=offlineHarness({usage:{
      prompt_tokens:50,completion_tokens:129,
      completion_tokens_details:{reasoning_tokens:100},
    }});
    await expect(h.run()).rejects.toMatchObject({code:'USAGE_UNKNOWN'});
    expect(h.metrics[0]).toMatchObject({
      outcome:'usage_unknown',failurePhase:'usage_invalid',
    });
  });

  it('fails before dispatch when the conservative whole-turn quote is over budget',async()=>{
    const h=offlineHarness({rejectReserve:true});
    await expect(h.run()).rejects.toMatchObject({code:'PRE_DISPATCH_REJECTED'});
    expect(h.dispatches).toBe(0);
    expect(h.metrics).toHaveLength(0);
  });
});
