// Watchtower-Track: security
// No external HTTP. This uses only a local synthetic Fetch Response, not a
// Provider-signed receipt or an authorized Se-yeon Character reply.
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
  OpenAiSeyeonStructuredProviderErrorV1,
  type OpenAiSeyeonStructuredProviderConfigV1,
  type SeyeonUnverifiedTransportOutputReceiptV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type {
  SeyeonAiCostEventV1,
} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';

const request:SeyeonStructuredProviderRequestV2={
  contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  purpose:'semantic_review',
  instructions:'R39 fixed offline synthetic request with no private content.',
  input:{fixture:true,case:'durability-gate'},
  responseSchema:{
    type:'object',additionalProperties:false,
    properties:{ok:{type:'boolean'}},required:['ok'],
  },
};
const price:NonNullable<OpenAiSeyeonStructuredProviderConfigV1['priceQuote']>={
  providerKey:'openai-responses',modelKey:'seyeon-r39-offline',
  priceVersion:'offline-r39-fixture-price-v1',
  inputMicroUsdPerMillion:1000000,
  cachedInputMicroUsdPerMillion:250000,
  outputMicroUsdPerMillion:4000000,
};
function fakeResponse(options:{
  status?:string;text?:string;usage?:boolean;
}={}):Response{
  const obj={
    id:'resp_r39_synthetic_not_provider',
    object:'response',
    model:'seyeon-r39-offline',
    status:options.status??'completed',
    output:[{
      type:'message',role:'assistant',
      content:[{
        type:'output_text',
        text:options.text??'{"ok":true}',
      }],
    }],
    ...(options.usage===false?{}:{
      usage:{
        input_tokens:100,output_tokens:50,
        input_tokens_details:{cached_tokens:0},
        output_tokens_details:{reasoning_tokens:0},
      },
    }),
  };
  return new Response(JSON.stringify(obj),{
    status:200,headers:{'content-type':'application/json'},
  });
}
function strictConfig(input:{
  fetchImpl:NonNullable<OpenAiSeyeonStructuredProviderConfigV1['fetchImpl']>;
  after:(event:SeyeonAiCostEventV1)=>Promise<void>;
  afterOutput?:(receipt:SeyeonUnverifiedTransportOutputReceiptV1)=>Promise<void>;
  before?:NonNullable<OpenAiSeyeonStructuredProviderConfigV1['meteredBeforeDispatch']>;
}):OpenAiSeyeonStructuredProviderConfigV1{
  return {
    apiKey:'not-a-real-r39-offline-only-api-key',
    model:'seyeon-r39-offline',maxOutputTokens:256,priceQuote:price,
    requireDurableOutcomeReceipt:true,
    meteredBeforeDispatch:input.before??(async()=>undefined),
    meteredAfterOutcome:input.after,
    meteredAfterStructuredOutput:input.afterOutput??(async()=>undefined),
    fetchImpl:input.fetchImpl,
  };
}
describe('R39 STRICT durable outcome: exact native Responses adapter, synthetic HTTP only',()=>{
  it('refuses any strict request without server-owned admission, pricing, cap or receipt writer',()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse());
    const base=strictConfig({fetchImpl,after:async()=>undefined});
    const cases:OpenAiSeyeonStructuredProviderConfigV1[]=[
      {...base,meteredBeforeDispatch:undefined},
      {...base,meteredAfterOutcome:undefined},
      {...base,meteredAfterStructuredOutput:undefined},
      {...base,priceQuote:undefined},
      {...base,maxOutputTokens:undefined},
      {...base,origin:'https://untrusted-provider.example.invalid'},
    ];
    for(const config of cases){
      expect(()=>createOpenAiSeyeonStructuredProviderV1(config))
        .toThrow(OpenAiSeyeonStructuredProviderErrorV1);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('releases synthetic structured output only AFTER durable outcome callback resolves',async()=>{
    const fetchImpl=vi.fn(async (_url:string,init:RequestInit)=>{
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('manual');
      const native=JSON.parse(String(init.body)) as Record<string,unknown>;
      expect(native).toMatchObject({
        model:'seyeon-r39-offline',store:false,max_output_tokens:256,
      });
      return fakeResponse();
    });
    let release:()=>void=()=>{throw Error('Callback was not installed');};
    let admissionBody='';
    let receiptStarted=false;
    const events:SeyeonAiCostEventV1[]=[];
    const outputReceipts:SeyeonUnverifiedTransportOutputReceiptV1[]=[];
    const order:string[]=[];
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,
      before:async(call,body)=>{
        expect(call.requestBodyBytes).toBe(
          new TextEncoder().encode(body).byteLength,
        );
        admissionBody=body;
      },
      after:async event=>{
        events.push(event);
        receiptStarted=true;
        order.push('cost-start');
        await new Promise<void>(resolve=>{release=resolve;});
        order.push('cost-durable');
      },
      afterOutput:async proof=>{
        order.push('output-durable');
        outputReceipts.push(proof);
      },
    }));
    let released=false;
    const inFlight=Promise.resolve(provider.generate(request)).then(output=>{
      released=true;return output;
    });
    await vi.waitFor(()=>{expect(receiptStarted).toBe(true);});
    expect(released).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(admissionBody).toContain('R39 fixed offline synthetic request');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      purpose:'semantic_review',providerKey:'openai-responses',
      modelKey:'seyeon-r39-offline',outcome:'response_received',
      estimatedCostMicroUsd:300,
    });
    release();
    expect(await inFlight).toEqual({ok:true});
    expect(released).toBe(true);
    expect(order).toEqual(['cost-start','cost-durable','output-durable']);
    expect(outputReceipts).toHaveLength(1);
    const proof=outputReceipts[0]!;
    const body=await fakeResponse().text();
    const sha=(text:string)=>'sha256:wire-utf8:v1:'+
      createHash('sha256').update(text,'utf8').digest('hex');
    expect(proof).toMatchObject({
      schemaVersion:'seyeon-unverified-transport-output-receipt-r39',
      originKind:'unverified_transport_bytes_only',
      purpose:'semantic_review',
      providerKey:'openai-responses',modelKey:'seyeon-r39-offline',
      responseId:'resp_r39_synthetic_not_provider',
      responseBodyDigest:sha(body),
      structuredOutputDigest:sha('{"ok":true}'),
      callId:events[0]!.callId,
      providerOutputVerified:false,outputGuardVerified:false,
      permitsAtomicCommit:false,permitsHttpReveal:false,
    });
  });
  it('withholds the entire response if actual cost outcome persistence fails',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse());
    const after=vi.fn(async()=>{throw Error('R39_FAKE_DB_OUTAGE');});
    const provider=createOpenAiSeyeonStructuredProviderV1(
      strictConfig({fetchImpl,after}),
    );
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'OUTCOME_RECEIPT_NOT_DURABLE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
  it('withholds output if the exact native transport/output digest receipt is not durable',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse());
    const afterCost=vi.fn(async()=>undefined);
    const afterOutput=vi.fn(async()=>{
      throw Error('R39_SYNTHETIC_DIGEST_STORE_UNAVAILABLE');
    });
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after:afterCost,afterOutput,
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'STRUCTURED_OUTPUT_RECEIPT_NOT_DURABLE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(afterCost).toHaveBeenCalledTimes(1);
    expect(afterOutput).toHaveBeenCalledTimes(1);
  });
  it('withholds the output when the synthetic transport omits priced token usage',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse({usage:false}));
    const after=vi.fn(async()=>undefined);
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after,
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'OUTCOME_RECEIPT_NOT_DURABLE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
  });
  it('cannot turn an incomplete response into a successful persistent receipt',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse({status:'incomplete'}));
    const events:SeyeonAiCostEventV1[]=[];
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after:async event=>{events.push(event);},
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'INVALID_RESPONSE',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('invalid_response');
  });
  it('withholds syntactically valid but non-object output in strict mode',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse({text:'["not-a-schema-object"]'}));
    const events:SeyeonAiCostEventV1[]=[];
    const afterOutput=vi.fn(async()=>undefined);
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after:async event=>{events.push(event);},afterOutput,
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'INVALID_STRUCTURED_OUTPUT',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('invalid_response');
    expect(afterOutput).not.toHaveBeenCalled();
  });
  it('cannot turn malformed output JSON into a successful persistent receipt',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse({text:'{invalid-json'}));
    const events:SeyeonAiCostEventV1[]=[];
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after:async event=>{events.push(event);},
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'INVALID_STRUCTURED_OUTPUT',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.outcome).toBe('invalid_response');
  });
  it('preserves existing non-strict legacy best-effort metric behavior',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse());
    const after=vi.fn(async()=>{throw Error('R39_LEGACY_METRIC_FAILURE');});
    const provider=createOpenAiSeyeonStructuredProviderV1({
      apiKey:'r39-not-a-real-live-provider-secret',
      model:'seyeon-r39-offline',
      maxOutputTokens:256,
      priceQuote:price,
      fetchImpl,
      meteredAfterOutcome:after,
    });
    expect(await provider.generate(request)).toEqual({ok:true});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
  it('denies network entirely if G4 before-dispatch admission fails',async()=>{
    const fetchImpl=vi.fn(async()=>fakeResponse());
    const after=vi.fn(async()=>undefined);
    const provider=createOpenAiSeyeonStructuredProviderV1(strictConfig({
      fetchImpl,after,
      before:async()=>{throw Error('R39_DENIED_BY_G4');},
    }));
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
});
