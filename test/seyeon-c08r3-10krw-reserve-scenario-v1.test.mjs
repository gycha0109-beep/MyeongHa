import {describe,it,expect} from 'vitest';
import {
  quoteSeyeonThreeCallTenKrwShadowV1,
  SEYEON_C08R3_STAGES_V1,
  SEYEON_C08R3_MAX_RATES_V1,
  SEYEON_C08R3_TURN_MAX_MICRO_USD_V1,
} from '../scripts/seyeon-c08r3-10krw-reserve-scenario-v1.mjs';

const stages=()=>{
 const bytes=[5425,14041,12737];
 return SEYEON_C08R3_STAGES_V1.map((name,i)=>({
  name,requestBodyBytes:bytes[i],maxCompletionTokens:1536,
 }));
};

describe('C08-R3 10-KRW/turn budget: strict OFFLINE stress scenario only',()=>{
 it('requires full 3 stages, inclusive 10 KRW goal and no extra paid call',()=>{
  expect(SEYEON_C08R3_TURN_MAX_MICRO_USD_V1).toBe(4000);
  const quote=quoteSeyeonThreeCallTenKrwShadowV1({stages:stages()});
  expect(quote.scope).toBe('OFFLINE_SCENARIO_ONLY_NOT_PRODUCTION_ADMISSION');
  expect(quote.stages.map(s=>s.stage)).toEqual(SEYEON_C08R3_STAGES_V1);
  expect(quote.rates).toEqual(SEYEON_C08R3_MAX_RATES_V1);
  expect(quote.reservedMicroUsd).toBe(6675);
  expect(quote.reserveUpperKrw).toBe(16.6875);
  expect(quote.targetKrw).toBe(10);
  expect(quote.targetMetUnderStressAssumptions).toBe(false);
  expect(quote.providerInvoiceReconciled).toBe(false);
  expect(quote.providerHardCapVerified).toBe(false);
  expect(quote.actualModelLatencyVerified).toBe(false);
  expect(quote.modelQualityVerified).toBe(false);
  expect(Object.isFrozen(quote)).toBe(true);
  expect(Object.isFrozen(quote.stages)).toBe(true);
 });

 it('can illustrate lower unverified pricing without promoting it to a live provider fact',()=>{
  const scenario=quoteSeyeonThreeCallTenKrwShadowV1({
   stages:stages(),
   rates:{inputUsdPerMillion:0.03,outputUsdPerMillion:0.12},
  });
  expect(scenario.targetMetUnderStressAssumptions).toBe(true);
  expect(scenario.reserveUpperKrw).toBe(3.8025);
  expect(scenario.scope).toContain('OFFLINE_SCENARIO_ONLY');
  expect(scenario.providerHardCapVerified).toBe(false);
 });

 it('rejects missing, duplicated, changed or over-cap model stages',()=>{
  const valid=stages();
  for(const broken of [
   [],[...valid.slice(0,2)], [...valid,valid[0]],
   [valid[0],valid[0],valid[2]],
   [{...valid[0],name:'unauthorized_stage'},...valid.slice(1)],
   [{...valid[0],requestBodyBytes:0},...valid.slice(1)],
   [{...valid[0],requestBodyBytes:19201},...valid.slice(1)],
   [{...valid[0],maxCompletionTokens:0},...valid.slice(1)],
   [{...valid[0],maxCompletionTokens:1537},...valid.slice(1)],
  ]){
   expect(()=>quoteSeyeonThreeCallTenKrwShadowV1({stages:broken}))
    .toThrow(/C08R3_.*_HOLD/);
  }
 });

 it('fails closed on missing / unverifiable rates, request fees and retries',()=>{
  const ok=stages();
  for(const opts of [
   {rates:null},{rates:{}},
   {rates:{inputUsdPerMillion:0,outputUsdPerMillion:0.12}},
   {rates:{inputUsdPerMillion:0.16,outputUsdPerMillion:0.12}},
   {rates:{inputUsdPerMillion:0.03,outputUsdPerMillion:0.401}},
   {rates:{inputUsdPerMillion:NaN,outputUsdPerMillion:0.12}},
   {extraPaidCalls:1},{extraPaidCalls:-1},{perRequestFeeMicroUsd:1},
  ]){
   expect(()=>quoteSeyeonThreeCallTenKrwShadowV1({stages:ok,...opts}))
    .toThrow('C08R3_UNVERIFIED_RATE_OR_TOPOLOGY_HOLD');
  }
 });
});
