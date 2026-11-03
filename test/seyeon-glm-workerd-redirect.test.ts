import {describe,expect,it,vi} from 'vitest';
import {createSeyeonGlmRendererV1,SEYEON_GLM_RENDERER_MODEL_V1} from '../apps/api/src/openrouter-seyeon-glm-renderer-v1.js';

const request = {
  contractVersion:'seyeon-structured-provider-v2',
  purpose:'dialogue_render',
  instructions:'Synthetic instructions',
  input:{message:'synthetic'},
  responseSchema:{
    type:'object',additionalProperties:false,required:['accepted'],
    properties:{accepted:{type:'boolean'}},
  },
} as const;

describe('GLM renderer is compatible with Cloudflare Workers fetch',()=>{
  it('uses manual redirect mode and accepts an ordinary structured result',async()=>{
    const outcomes=vi.fn(async (_event:unknown)=>undefined);
    const send=vi.fn(async(_url:string,init:RequestInit)=>{
      expect(init.redirect).toBe('manual');
      return Response.json({
        model:SEYEON_GLM_RENDERER_MODEL_V1,
        choices:[{finish_reason:'stop',message:{
          role:'assistant',content:'{"accepted":true}',
        }}],
        usage:{
          prompt_tokens:15,completion_tokens:8,
          prompt_tokens_details:{cached_tokens:0},
          completion_tokens_details:{reasoning_tokens:0},
        },
      });
    });
    const provider=createSeyeonGlmRendererV1({
      apiKey:'synthetic-key-1234567890-123456',
      fetchImpl:send as unknown as typeof fetch,
      afterOutcome:outcomes,
    });
    await expect(provider.generate(request)).resolves.toEqual({accepted:true});
    expect(send).toHaveBeenCalledOnce();
    expect(outcomes.mock.calls[0]?.[0]).toMatchObject({
      outcome:'response_received',httpStatus:200,costStatus:'estimated',
    });
  });

  it('denies an upstream redirect rather than following it',async()=>{
    const outcomes=vi.fn(async (_event:unknown)=>undefined);
    const send=vi.fn(async(_url:string,init:RequestInit)=>{
      expect(init.redirect).toBe('manual');
      return new Response(null,{status:302,
        headers:{location:'https://example.invalid/redirect'}});
    });
    const provider=createSeyeonGlmRendererV1({
      apiKey:'synthetic-key-1234567890-123456',
      fetchImpl:send as unknown as typeof fetch,
      afterOutcome:outcomes,
    });
    await expect(provider.generate(request)).rejects.toThrow('HTTP failure');
    expect(send).toHaveBeenCalledOnce();
    expect(outcomes.mock.calls[0]?.[0]).toMatchObject({
      outcome:'http_failure',httpStatus:302,costStatus:'usage_unknown',
    });
  });
});
