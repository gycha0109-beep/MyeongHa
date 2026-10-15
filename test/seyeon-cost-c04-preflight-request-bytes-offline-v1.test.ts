import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import { createIntegrityClassifier, createDisclosureClassifier } from
  '../apps/api/src/seyeon-production-governance-v1.js';
import { createSeyeonUnifiedPreflightShadowV1 } from
  '../apps/api/src/seyeon-unified-preflight-shadow-v1.js';

type Row = {
  purpose:string; model:string; fullRequestBytes:number;
  instructionsBytes:number; inputJsonBytes:number; schemaJsonBytes:number;
};
function mockedProvider(model:string, rows:Row[]) {
  const bounds=new Map<string,number>();
  return createOpenAiSeyeonStructuredProviderV1({
    model,apiKey:'OFFLINE_FAKE_KEY_1234567890000000000000',
    beforeDispatch({purpose,requestBodyBytes}) {
      bounds.set(purpose,requestBodyBytes);
    },
    async fetchImpl(_url,init) {
      const raw=String(init?.body ?? '');
      const body=JSON.parse(raw);
      const purpose:string=body.text.format.name
        .replace(/^myeongha_/u,'').replace(/_v2$/u,'');
      if(Buffer.byteLength(raw,'utf8')!==bounds.get(purpose))
        throw new Error('Real provider size hook mismatch');
      if(body.store!==false||
          !body.instructions.endsWith(SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1)||
          body.input?.[0]?.role!=='user'||
          body.text?.format?.strict!==true)
        throw new Error('Actual final provider envelope drifted');
      rows.push({
        purpose,model,fullRequestBytes:Buffer.byteLength(raw,'utf8'),
        instructionsBytes:Buffer.byteLength(body.instructions,'utf8'),
        inputJsonBytes:Buffer.byteLength(body.input[0].content[0].text,'utf8'),
        schemaJsonBytes:Buffer.byteLength(JSON.stringify(body.text.format.schema),'utf8'),
      });
      const payload=purpose==='integrity_classification'?{claims:[]}:
        purpose==='disclosure_classification'?{
          topicKey:null,questionContext:'casual_curiosity',
        }:purpose==='unified_preflight_shadow'?{
          claims:[],topicKey:null,questionContext:'casual_curiosity',
        }:null;
      if(payload===null)throw new Error('Non-preflight model call in offline cost probe');
      return new Response(JSON.stringify({
        status:'completed',output:[{type:'message',
          content:[{type:'output_text',text:JSON.stringify(payload)}]}],
        usage:{input_tokens:1,output_tokens:1,
          input_tokens_details:{cached_tokens:0},
          output_tokens_details:{reasoning_tokens:0}},
      }),{status:200,headers:{'content-type':'application/json'}});
    },
  });
}
function summarize(rows:Row[]) {
  return {
    calls:rows.length,
    totalUtf8RequestBytes:rows.reduce((s,r)=>s+r.fullRequestBytes,0),
    stages:rows.map(r=>({...r})).sort((a,b)=>a.purpose.localeCompare(b.purpose)),
  };
}
describe('COST-04 first-contact preflight 2→1 actual-serializer byte audit (offline)',()=>{
  it.each(['안녕, 세연아.','안녕하세요, 세연님 😊'])(
    'measures real final request-body UTF-8 for the same synthetic input: %s',
    async userText=>{
      const log=vi.spyOn(console,'info').mockImplementation(()=>{});
      try {
        const legacy:Row[]=[],candidate:Row[]=[];
        const terra=mockedProvider('gpt-5.6-terra',legacy);
        const luna=mockedProvider('gpt-5.6-luna',candidate);
        await Promise.all([
          createIntegrityClassifier(terra).classify({characterId:'seyeon',userText}),
          createDisclosureClassifier(terra).classify({
            characterId:'seyeon',userQuestion:userText,
          }),
        ]);
        await createSeyeonUnifiedPreflightShadowV1(luna).classify({
          characterId:'seyeon',userText,
        });
        expect(legacy.map(r=>r.purpose).sort()).toEqual([
          'integrity_classification','disclosure_classification'].sort());
        expect(candidate.map(r=>r.purpose)).toEqual(['unified_preflight_shadow']);
        expect([...legacy,...candidate].every(r=>
          r.fullRequestBytes>r.instructionsBytes&&
          r.fullRequestBytes>r.inputJsonBytes&&
          r.fullRequestBytes>r.schemaJsonBytes)).toBe(true);
        expect(legacy[0]?.model).toBe('gpt-5.6-terra');
        expect(candidate[0]?.model).toBe('gpt-5.6-luna');
        const a=summarize(legacy),b=summarize(candidate);
        log.mockRestore();
        // Numeric synthetic metadata only. NO prompts, keys, invoice or tokens.
        console.info('SEYEON_C04_OFFLINE_PREFLIGHT_UTF8_BYTES '+JSON.stringify({
          fixture:userText.includes('😊')?'unicode_greeting':'greeting',
          legacy:a,candidate:b,
          realInputTokens:null,realBilledUsd:null,
          modelRecallMeasured:false,paidEvaluationPermitted:false,
        }));
      } finally { log.mockRestore(); }
    });
});
