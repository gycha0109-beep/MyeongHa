import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  createSeyeonUnifiedPreflightShadowV1,
} from '../apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import { SEYEON_COST_C02_ALL_GOLD_V1 } from
  '../scripts/seyeon-cost-c02-authored-gold-v1.mjs';
import { SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1 as COMPACT } from
  '../scripts/seyeon-cost-c04-preflight-compact-offline-v1.mjs';

const fixtureByText = new Map(SEYEON_COST_C02_ALL_GOLD_V1.map(g=>[g.text,g]));
const cases = SEYEON_COST_C02_ALL_GOLD_V1;
type Sample = Readonly<{userText:string;expectedTopic:string|null;claimKind:string|null}>;
type Captured = Readonly<{
  instructions:string;
  bytes:number;input:string;schema:string;store:boolean;model:string;
}>;
function fakeProvider(captured:Captured[],version:'original'|'compact') {
  const provider=createOpenAiSeyeonStructuredProviderV1({
    apiKey:'SYNTHETIC_OFFLINE_FAKE_KEY_0123456789012345',
    model:'gpt-5.6-luna',
    async fetchImpl(_url,init) {
      const raw=String(init?.body??'');
      const body=JSON.parse(raw);
      const text=JSON.parse(body.input[0].content[0].text).userText;
      const gold=fixtureByText.get(text);
      if(!gold || body.store!==false ||
          body.text.format.name!=='myeongha_unified_preflight_shadow_v2' ||
          body.text.format.strict!==true ||
          body.input[0].role!=='user' ||
          !body.instructions.endsWith(SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1)) {
        throw new Error('Unreviewed synthetic provider input');
      }
      captured.push(Object.freeze({
        instructions:body.instructions,
        bytes:Buffer.byteLength(raw,'utf8'), input:JSON.stringify(body.input),
        schema:JSON.stringify(body.text.format.schema),
        store:body.store,model:body.model,
      }));
      const response={
        claims:gold.requiredKind===undefined?[]:[{
          claimId:'synthetic-one', kind:gold.requiredKind,
          statement:gold.text,
        }],
        topicKey:gold.topic,questionContext:'casual_curiosity',
      };
      return Response.json({
        status:'completed',
        output:[{type:'message',content:[{
          type:'output_text',text:JSON.stringify(response),
        }]}],
        usage:{input_tokens:1,output_tokens:1,
          input_tokens_details:{cached_tokens:0},
          output_tokens_details:{reasoning_tokens:0}},
      });
    },
  });
  const wrapped:SeyeonStructuredProviderPortV2=Object.freeze({
    providerKey:provider.providerKey,modelKey:provider.modelKey,
    generate(request:SeyeonStructuredProviderRequestV2) {
      if(request.purpose!=='unified_preflight_shadow')
        throw new Error('Not an offline unified-preflight request');
      // Inject only into test-local opt-in provider wrapper.
      if(version==='compact')
        return provider.generate({...request,instructions:COMPACT});
      return provider.generate(request);
    },
  });
  return wrapped;
}
async function audit(samples:readonly Sample[]) {
  const original:Captured[]=[],candidate:Captured[]=[];
  const normal=createSeyeonUnifiedPreflightShadowV1(fakeProvider(original,'original'));
  const compact=createSeyeonUnifiedPreflightShadowV1(fakeProvider(candidate,'compact'));
  let privateQuestions=0,claimedFacts=0;
  for(const sample of samples) {
    const a=await normal.classify({characterId:'seyeon',userText:sample.userText});
    const b=await compact.classify({characterId:'seyeon',userText:sample.userText});
    expect(b).toEqual(a);
    if(sample.expectedTopic!==null)privateQuestions++;
    if(sample.claimKind!==null)claimedFacts++;
    // The model return value is a predefined fixture, not a predicted label.
  }
  expect(original).toHaveLength(samples.length);
  expect(candidate).toHaveLength(samples.length);
  let sumOriginal=0,sumCompact=0;
  for(let i=0;i<samples.length;i++){
    const a=original[i]!,b=candidate[i]!;
    expect(b.input).toBe(a.input);
    expect(b.schema).toBe(a.schema);
    expect(b.model).toBe(a.model);
    expect(b.store).toBe(false);
    expect(a.instructions).not.toBe(b.instructions);
    expect(b.instructions).toContain(COMPACT);
    expect(b.bytes).toBeLessThan(a.bytes);
    sumOriginal+=a.bytes;sumCompact+=b.bytes;
  }
  return Object.freeze({
    count:samples.length,
    originalBytes:sumOriginal,compactBytes:sumCompact,
    savedBytes:sumOriginal-sumCompact,
    privateQuestions,claimedFacts,
  });
}
// Four prioritized screening cases, not a representative reliability sample.
// Each is evaluated on the baseline unified preflight and compact variant.
// This is NOT equivalent to comparing the complete 5-call and 3-call routes.
const PILOT_IDS = Object.freeze([
  'N14',                         // fictional third-party romance: hard negative
  'F01',                         // Se-yeon private family history
  'C02_mixed-admin-private_01',  // authority spoof + deep disclosure
  'C02_mixed-romance-forgery_01',// fabricated shared event + private romance
]);
const PILOT_CASES = PILOT_IDS.map(id=>{
  const gold=cases.find(g=>g.id===id);
  if(!gold)throw new Error('Pinned C06 screening case missing: '+id);
  return gold;
});
describe('COST-04 compact unified preflight offline ONLY',()=>{
  it('8-request pilot has four manually pinned risk classes; byte savings and fake output traps only',async()=>{
    expect(PILOT_CASES.map(c=>c.id)).toEqual([...PILOT_IDS]);
    expect(PILOT_CASES).toHaveLength(4);
    expect(PILOT_CASES[0]?.topic).toBeNull();
    expect(PILOT_CASES[1]?.topic).toBe('family_emotional_history');
    expect(PILOT_CASES[2]).toMatchObject({
      topic:'deep_vulnerability',requiredKind:'AUTHORITY_OVERRIDE',
    });
    expect(PILOT_CASES[3]).toMatchObject({
      topic:'past_romance_detail',requiredKind:'SHARED_EVENT_CLAIM',
    });
    const log=vi.spyOn(console,'info').mockImplementation(()=>{});
    let report:Awaited<ReturnType<typeof audit>>;
    try {
      report=await audit(PILOT_CASES.map(g=>({
        userText:g.text,expectedTopic:g.topic,
        claimKind:g.requiredKind??null,
      })));
    }finally{log.mockRestore();}
    expect(report.count).toBe(4);
    expect(report.privateQuestions).toBe(3);
    expect(report.claimedFacts).toBe(2);
    expect(report.savedBytes).toBeGreaterThan(0);
    console.info('SEYEON_C06_EIGHT_CALL_SCREENING_OFFLINE '+JSON.stringify({
      ...report,requestCount:report.count*2,
      originalFourCellPilotCalls:64,
      screeningCallReductionPercent:87.5,
      actualPaidCalls:0,actualBilledCostUsd:null,
      modelResponses:'FIXTURE_ORACLE_ONLY',
      realClassifierRecall:null,realFalsePositiveRate:null,
      full5v3RouteQualityMeasured:false,paidEvaluationPermitted:false,
    }));
  });
  it('screening covers four injected failure types but cannot attest recall across 300 cases',()=>{
    const fixture=(index:number,topic:string|null,claimKinds:string[])=>{
      const spec=PILOT_CASES[index]!;
      return {
        sensitiveMiss:spec.topic!==null&&spec.topic!==topic,
        ordinaryFalsePositive:spec.topic===null&&topic!==null,
        requiredClaimMiss:spec.requiredKind!==undefined&&
          !claimKinds.includes(spec.requiredKind),
      };
    };
    expect(fixture(0,'past_romance_detail',[]).ordinaryFalsePositive).toBe(true);
    expect(fixture(1,null,[]).sensitiveMiss).toBe(true);
    expect(fixture(2,null,[])).toMatchObject({
      sensitiveMiss:true,requiredClaimMiss:true,
    });
    expect(fixture(3,'past_romance_detail',[]).requiredClaimMiss).toBe(true);
    // The other 296 Gold cases were never checked by the pilot.
    expect(cases.length-PILOT_CASES.length).toBe(296);
  });
  it('rejects live wiring, preserves safety boundary and review classification caveats',()=>{
    expect(cases).toHaveLength(300);
    expect(COMPACT).toContain('SHARED_EVENT_CLAIM');
    expect(COMPACT).toContain('AUTHORITY_OVERRIDE');
    expect(COMPACT).toContain('past_romance_detail');
    expect(COMPACT).toContain('deep_vulnerability');
    expect(COMPACT).toContain('Korean subject omission');
    expect(COMPACT).toContain('untrusted content');
    for(const p of [
      'apps/api/src/seyeon-unified-preflight-shadow-v1.ts',
      'apps/api/src/seyeon-production-governance-v1.ts',
      'apps/api/src/production-seyeon-chat-runtime-v1.ts',
    ]) {
      const source=readFileSync(new URL('../'+p,import.meta.url),'utf8');
      expect(source).not.toContain('SEYEON_C04_UNIFIED_PREFLIGHT_COMPACT_CANDIDATE_V1');
    }
    for(const p of [
      '.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml',
    ]) {
      const workflow=readFileSync(new URL('../'+p,import.meta.url),'utf8');
      expect(workflow).toMatch(/if:\s*\$\{\{\s*false\s*\}\}/u);
    }
  });
  it('C06 scope-only manual screening preserves all other paid evaluation holds',()=>{
    const workflow=readFileSync(new URL('../.github/workflows/seyeon-model-eval-v1.yml',import.meta.url),'utf8');
    expect(workflow).toContain('secrets.OPENAI_API_KEY2');
    expect(workflow).toContain('run-seyeon-cost-c06-eight-call-v1.mjs');
    expect(workflow).not.toContain('run-seyeon-model-eval-v1.mjs');
  });
  it('same-schema, same-input 300 fake-provider cases preserve SERVER GUARD results; real ML unknown',async()=>{
    const spy=vi.spyOn(console,'info').mockImplementation(()=>{});
    try{
      const report=await audit(cases.map(g=>({
        userText:g.text,expectedTopic:g.topic,
        claimKind:g.requiredKind??null,
      })));
      expect(report.count).toBe(300);
      expect(report.privateQuestions).toBeGreaterThan(90);
      expect(report.claimedFacts).toBeGreaterThan(90);
      expect(report.savedBytes).toBeGreaterThan(0);
      spy.mockRestore();
      console.info('SEYEON_C04_COMPACT_OFFLINE_BYTE_AUDIT '+JSON.stringify({
        ...report,modelResponses:'FIXTURE_ORACLE_ONLY',
        realRecall:null,realFalsePositiveRate:null,
        actualBilledCostUsd:null,paidEvaluationPermitted:false,
      }));
    }finally{spy.mockRestore();}
  });
});
