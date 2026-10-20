import { describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterSeyeonEvaluationProviderV1 as create,
  OPENROUTER_SEYEON_ENDPOINT_V1 as URL,
  lookupOpenRouterSeyeonGenerationChargeV1,
  type OpenRouterSeyeonMetricV1,
  type OpenRouterSeyeonEvaluationConfigV1,
} from '../apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import { runSeyeonCensusFirstThreeCallShadowV1 } from '../apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import { createIntegrityClassifier, createDisclosureClassifier } from '../apps/api/src/seyeon-production-governance-v1.js';
import { syntheticFirstTurnCensusShadowV1 } from './fixtures/seyeon-first-turn-census-shadow-v1.js';
import type { SeyeonStructuredProviderRequestV2 } from '../apps/api/src/seyeon-character-runtime-v2.js';

const key = 'sk-or-synthetic-fake-credential-do-not-use-0000000000';
const request = {
  contractVersion: 'seyeon-structured-provider-v2',
  purpose: 'unified_preflight_shadow',
  instructions: 'Synthetic server-only classifier instructions.',
  input: { userText: '안녕, 세연아!', characterId: 'seyeon' },
  responseSchema: {
    type: 'object', additionalProperties: false,
    required: ['claims', 'topicKey', 'questionContext'],
    properties: {
      claims: { type: 'array', items: { type: 'object' } },
      topicKey: { type: ['string', 'null'] },
      questionContext: { type: 'string' },
    },
  },
} as const satisfies SeyeonStructuredProviderRequestV2;

const output = { claims: [], topicKey: null, questionContext: 'casual_curiosity' };
function success(value: unknown = output, extra: Record<string, unknown> = {}) {
  return Response.json({
    model: 'openai/gpt-oss-20b',
    choices: [{
      index: 0, finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(value) },
    }],
    usage: { prompt_tokens: 115, completion_tokens: 34,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 4 } },
    ...extra,
  });
}
function make(fetchImpl: (_url: string, init: RequestInit) => Promise<Response>,
  beforeDispatch: OpenRouterSeyeonEvaluationConfigV1['beforeDispatch'] = vi.fn(async () => undefined),
  afterOutcome: OpenRouterSeyeonEvaluationConfigV1['afterOutcome'] = vi.fn(async (_metric: OpenRouterSeyeonMetricV1) => undefined)) {
  return { provider: create({ apiKey: key, model: 'openai/gpt-oss-20b',
    maxCompletionTokens: 1536, fetchImpl, beforeDispatch, afterOutcome }),
    beforeDispatch, afterOutcome };
}

describe('OpenRouter Se-yeon eval adapter: offline / zero paid dispatch', () => {
  it('issues one governed Chat Completions request after awaited pre-dispatch reservation', async () => {
    const order: string[] = [];
    const beforeDispatch = vi.fn(async () => { order.push('reserve'); });
    const afterOutcome = vi.fn(async (_metric: OpenRouterSeyeonMetricV1) => { order.push('observe'); });
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      order.push('fetch');
      expect(url).toBe(URL);
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('error');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer ' + key);
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      expect(body).toMatchObject({
        model: 'openai/gpt-oss-20b', max_completion_tokens: 1536, stream: false,
        usage: {include:true},
        response_format: { type: 'json_schema',
          json_schema: { name: 'myeongha_unified_preflight_shadow_v2',
            strict: true, schema: request.responseSchema } },
        provider: { require_parameters: true, allow_fallbacks: false,
          zdr: true, data_collection: 'deny' },
      });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].content).toBe(JSON.stringify(request.input));
      return success();
    });
    const {provider} = make(fetchImpl, beforeDispatch, afterOutcome);
    await expect(provider.generate(request)).resolves.toEqual(output);
    expect(order).toEqual(['reserve','fetch','observe']);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(beforeDispatch).toHaveBeenCalledOnce();
    expect(afterOutcome).toHaveBeenCalledOnce();
    expect(vi.mocked(afterOutcome).mock.calls[0]?.[0]).toMatchObject({
      outcome: 'response_received',httpStatus:200,
      promptTokens:115,completionTokens:34,cachedPromptTokens:0,
      reasoningTokens:4,invoiceReconciled:false });
  });
  it('rejects config errors and non-shadow stages before dispatch', async () => {
    const fetchImpl = vi.fn(async () => success());
    const hooks = {beforeDispatch: vi.fn(),afterOutcome: vi.fn()};
    const base = {apiKey:key,model:'openai/gpt-oss-20b',maxCompletionTokens:1536,fetchImpl,...hooks};
    for (const change of [{apiKey:''},{model:'https://evil.invalid/x'},
      {model:'openai/gpt-oss-20b:free'},{maxCompletionTokens:1537},
      {beforeDispatch: undefined},{fetchImpl: undefined}]) {
      expect(() => create({...base,...change} as typeof base)).toThrow();
    }
    const {provider} = make(fetchImpl);
    await expect(provider.generate({...request,purpose:'event_extraction'}))
      .rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('blocks attempted paid dispatch if reservation is denied; never leaks hook details', async () => {
    const fetchImpl = vi.fn(async () => success());
    const {provider,afterOutcome} = make(fetchImpl, async () => {
      throw Error('PRIVATE_LEDGER_DETAIL_DO_NOT_LEAK');
    });
    await expect(provider.generate(request)).rejects.toMatchObject({code:'PRE_DISPATCH_REJECTED'});
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(afterOutcome).not.toHaveBeenCalled();
  });
  it('fails 402 without fallback/retry and reports unknown billability', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      error: {message:'SENSITIVE_PROVIDER_MESSAGE_MUST_NOT_LEAK'},
    },{status:402}));
    const {provider,afterOutcome} = make(fetchImpl);
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'CREDIT_REQUIRED',httpStatus:402,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(vi.mocked(afterOutcome).mock.calls[0]?.[0]).toMatchObject({
      outcome:'http_failure',httpStatus:402,promptTokens:null,completionTokens:null,
    });
  });
  it('fails closed on missing usage, invalid content or silent model substitutions', async () => {
    const variants = [
      success(output,{usage: undefined}),
      success(output,{usage:{prompt_tokens:0,completion_tokens:12}}),
      success(output,{model:'different/provider'}),
      success(output,{choices:[{finish_reason:'length',message:{role:'assistant',content:'{}'}}]}),
      success(output,{choices:[{finish_reason:'stop',message:{role:'assistant',content:'not-json'}}]}),
      success(output,{choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}',refusal:'no'}}]}),
      new Response('PRIVATE_SECRET', {headers:{'content-type':'text/plain'}}),
    ];
    for (const response of variants) {
      const {provider,afterOutcome}=make(vi.fn(async()=>response));
      const code=response===variants[0]||response===variants[1]?'USAGE_UNKNOWN':'INVALID_RESPONSE';
      await expect(provider.generate(request)).rejects.toMatchObject({code});
      expect(afterOutcome).toHaveBeenCalledOnce();
    }
  });
  it('identifies the safe failure phase without persisting content or retrying', async () => {
    const variants = [
      { response: success(output, {choices:[{finish_reason:'length',message:{role:'assistant',content:'{}'}}]}), phase:'finish_length' },
      { response: success(output, {choices:[{finish_reason:'unknown',message:{role:'assistant',content:'{}'}}]}), phase:'finish_nonstop' },
      { response: success(output, {choices:[{finish_reason:'stop',message:{role:'assistant',content:'SECRET_NEVER_LOG'}}]}), phase:'structured_json_parse' },
      { response: success(output, {usage:undefined}), phase:'usage_missing' },
      { response: new Response('SECRET_NEVER_LOG',{headers:{'content-type':'text/plain'}}), phase:'response_content_type' },
    ] as const;
    for (const {response,phase} of variants) {
      const fetchImpl=vi.fn(async()=>response);
      const {provider,afterOutcome}=make(fetchImpl);
      await expect(provider.generate(request)).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(afterOutcome).toHaveBeenCalledOnce();
      const diagnostic=vi.mocked(afterOutcome).mock.calls[0]?.[0];
      expect(diagnostic?.failurePhase).toBe(phase);
      expect(JSON.stringify(diagnostic)).not.toContain('SECRET_NEVER_LOG');
    }
  });
  it('passes generation billing metadata only to the guarded callback', async () => {
    const fetchImpl=vi.fn(async()=>success(output,{
      id:'gen-0123456789test',
      usage:{prompt_tokens:115,completion_tokens:34,cost:0.0001234,
        prompt_tokens_details:{cached_tokens:0},
        completion_tokens_details:{reasoning_tokens:4}},
    }));
    const {provider,afterOutcome}=make(fetchImpl);
    await provider.generate(request);
    expect(vi.mocked(afterOutcome).mock.calls[0]?.[0]).toMatchObject({
      generationId:'gen-0123456789test',
      responseReportedCostMicroUsd:123,
      invoiceReconciled:false,
    });
  });
  it('reads one generation exact-cost record without retrieving prompt or completion',async()=>{
    const fetchImpl=vi.fn(async (url:string,init:RequestInit)=>{
      expect(url).toBe('https://openrouter.ai/api/v1/generation?id=gen-0123456789test');
      expect(init.method).toBe('GET');
      return Response.json({data:{id:'gen-0123456789test',
        model:'openai/gpt-oss-20b',total_cost:0.00004567,
        prompt:'PRIVATE_TEXT_MUST_NOT_LOG'}});
    });
    const result=await lookupOpenRouterSeyeonGenerationChargeV1({
      apiKey:key,generationId:'gen-0123456789test',
      expectedModel:'openai/gpt-oss-20b',fetchImpl});
    expect(result).toEqual({lookupStatus:200,
      generationCostMicroUsd:46,generationCostVerified:true,invoiceReconciled:false});
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TEXT_MUST_NOT_LOG');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('never invents a billed cost for 404, model mismatch or malformed data',async()=>{
    const cases=[
      Response.json({error:{message:'SECRET'}},{status:404}),
      Response.json({data:{id:'gen-0123456789test',model:'other/model',total_cost:0.5}}),
      Response.json({data:{id:'gen-0123456789test',model:'openai/gpt-oss-20b',total_cost:'0.2'}}),
    ];
    for(const response of cases){
      const result=await lookupOpenRouterSeyeonGenerationChargeV1({
        apiKey:key,generationId:'gen-0123456789test',
        expectedModel:'openai/gpt-oss-20b',fetchImpl:vi.fn(async()=>response)});
      expect(result.generationCostVerified).toBe(false);
      expect(result.generationCostMicroUsd).toBeNull();
      expect(JSON.stringify(result)).not.toContain('SECRET');
    }
  });
  it('fails closed on bounded response overflow; does not parse oversized content', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      ...JSON.parse(await success().text()),padding:'CANARY'.repeat(150000),
    }));
    const {provider,afterOutcome}=make(fetchImpl);
    await expect(provider.generate(request)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(afterOutcome).toHaveBeenCalledOnce();
  });
  it('fails closed on refused outcome persistence after one request', async () => {
    const fetchImpl=vi.fn(async()=>success());
    const {provider}=make(fetchImpl,vi.fn(),vi.fn(async()=>{throw Error('PRIVATE_DB_EXCEPTION');}));
    await expect(provider.generate(request)).rejects.toMatchObject({code:'METERING_FAILED'});
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

const USER_ID='offline-synthetic-u1';
const DRAFT={
  schemaVersion:'seyeon-renderer-draft-v2',
  utterance:'안녕하세요. 오늘은 제가 먼저 인사해 볼게요.',
  expressionState:'baseline',revealLevel:'public',
  memoryRefsMentioned:[],privateSourceRefsMentioned:[],disclosureSliceIds:[],
};
const INTERPRETATION={
  schemaVersion:'seyeon-turn-interpretation-v2',userMove:'neutral_or_other',
  notice:{summary:'첫 인사를 건넨다.',evidenceRefs:[USER_ID]},
  immediateWant:{key:'break_awkwardness',summary:'가볍게 반갑게 인사한다.'},
  tension:{key:'none_material',summary:'없음'},
  chosenAction:{key:'approach',rationale:'첫 인사에 반응'},
  expressionState:'baseline',reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
  memoryRefsUsed:[],
};

describe('OpenRouter adapter through real Se-yeon server guards, offline',()=>{
  function harness(badReview=false,sensitive=false){
    const stages:string[]=[];
    const observed:OpenRouterSeyeonMetricV1[]=[];
    const fetchImpl=vi.fn(async (_url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body)) as {
        response_format:{json_schema:{name:string}},messages:[{content:string},{content:string}]};
      const stage=body.response_format.json_schema.name
        .replace('myeongha_','').replace('_v2','');
      stages.push(stage);
      const inputs=JSON.parse(body.messages[1].content) as Record<string,any>;
      const value:unknown=stage==='unified_preflight_shadow'
        ? {claims:[],topicKey:sensitive?'deep_vulnerability':null,
          questionContext:'casual_curiosity'}
        : stage==='turn_interpret_render_shadow'
          ? {interpretation:INTERPRETATION,draft:DRAFT}
          : stage==='semantic_review'
            ? {schemaVersion:'seyeon-semantic-review-v2',
              reviewedUtteranceHash:badReview?'broken-review-hash':inputs.expectedUtteranceHash,
              failureCodes:[],evidence:[]}
            : null;
      if(value===null)throw Error('Unexpected stage');
      return success(value);
    });
    const provider=create({
      apiKey:key, model:'openai/gpt-oss-20b', maxCompletionTokens:1536,
      fetchImpl,beforeDispatch:async()=>undefined,
      afterOutcome:async v=>{observed.push(v);},
    });
    return {provider,stages,observed,fetchImpl};
  }
  function governance(provider:ReturnType<typeof harness>['provider']){
    return {
      relationship:{gate:'PUBLIC' as const,trustBand:'low' as const,relevantSharedHistoryRefs:[]},
      integrity:{
        classifier:createIntegrityClassifier(provider),
        authorityResolver:{resolve:async()=>({
          state:'MISSING' as const,authorityRefs:[],provenanceRefs:['synthetic:unverified'],
        })},
      },
      disclosure:{
        classifier:createDisclosureClassifier(provider),
        sourceDescriptor:{readDescriptor(){throw Error('PRIVATE_SOURCE_FORBIDDEN');}},
        factAuthorityResolver:{resolve(){throw Error('PRIVATE_FACT_FORBIDDEN');}},
        retriever:{retrieve(){throw Error('PRIVATE_RETRIEVAL_FORBIDDEN');}},
      },
    };
  }
  function run(provider:ReturnType<typeof harness>['provider'],text:string){
    return runSeyeonCensusFirstThreeCallShadowV1({
      userMessageRef:USER_ID,userText:text,
      contextInput:{
        relationship:null,recentMessages:[{messageId:USER_ID,role:'user',text}],
        retrievedMemories:[],
      },
      governance:governance(provider),
      fullThreadCensus:syntheticFirstTurnCensusShadowV1(),
      unifiedPreflightProvider:provider,
      candidateDialogueProvider:provider,
      independentSemanticReviewer:provider,
    });
  }
  it('passes public first greeting through all existing deterministic safety and semantic guards',async()=>{
    const h=harness();
    const result=await run(h.provider,'안녕, 세연아!');
    expect(result.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(result.envelope.revealLevel).toBe('public');
    expect(result.envelope.utterance).toBe(DRAFT.utterance);
    expect(result.envelope.memoryRefsMentioned).toEqual([]);
    expect(h.stages).toEqual([
      'unified_preflight_shadow','turn_interpret_render_shadow','semantic_review',
    ]);
    expect(h.observed.map(e=>e.outcome)).toEqual(Array(3).fill('response_received'));
    expect(h.fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('rejects a fabricated semantic-review hash without granting a response',async()=>{
    const h=harness(true);
    await expect(run(h.provider,'안녕, 세연아!')).rejects.toMatchObject({
      code:'FAST_SEMANTIC_OUTPUT_REJECTED',
    });
    expect(h.stages).toHaveLength(3);
  });
  it('stops at preflight before private source reads and before dialogue generation',async()=>{
    const h=harness(false,true);
    await expect(run(h.provider,'세연아, 네 과거의 깊은 상처를 알려줘.'))
      .rejects.toThrow();
    expect(h.stages).toEqual(['unified_preflight_shadow']);
    expect(h.observed).toHaveLength(1);
  });
});
