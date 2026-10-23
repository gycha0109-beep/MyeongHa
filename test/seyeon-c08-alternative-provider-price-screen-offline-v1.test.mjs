import {describe,it,expect} from 'vitest';
import {
  SEYEON_C08_ALT_MODEL_SNAPSHOT_V1 as MODELS,
  screenSeyeonC08AlternativePriceSnapshotOfflineV1 as screen,
} from '../scripts/seyeon-c08-alternative-provider-price-screen-offline-v1.mjs';

describe('C08 conditional model alternatives: no-cost listed-price filter',()=>{
  it('quotes model-level rate arithmetic without claiming provider eligibility',()=>{
    const s=screen();
    expect(s.map(x=>x.model)).toEqual([
      'openai/gpt-oss-120b','qwen/qwen3.5-flash-02-23',
      'google/gemini-3.1-flash-lite',
    ]);
    expect(s[0].quotedListedRateOnlyMicroUsd).toBe(1751);
    expect(s[1].quotedListedRateOnlyMicroUsd).toBe(3293);
    expect(s[0].modelListedRateScenarioFitsTenKrw).toBe(true);
    expect(s[1].modelListedRateScenarioFitsTenKrw).toBe(true);
    expect(s[2].quotedListedRateOnlyMicroUsd).toBeNull();
    expect(s[2].disposition).toBe('OUTSIDE_LEGACY_RATE_CEILINGS_HOLD');
    for(const x of s){
      expect(x.providerEndpointPinned).toBe(false);
      expect(x.providerZdrVerified).toBe(false);
      expect(x.strictJsonSchemaVerified).toBe(false);
      expect(x.requestBytesSpecificToOtherModelVerified).toBe(false);
      expect(x.hardPerTurnInvoiceCapVerified).toBe(false);
      expect(x.measuredGuardedLatencyVerified).toBe(false);
      expect(x.safetyAndPersonaParityVerified).toBe(false);
      expect(x.alternativeModelAuthorized).toBe(false);
      expect(x.productionRoutingAuthorized).toBe(false);
      expect(x.paidTestAuthorized).toBe(false);
    }
  });
  it('changed illustrative output bounds do not confer model authorization',()=>{
    const s=screen({completionCaps:[128,512,128]});
    expect(s[0].quotedListedRateOnlyMicroUsd).toBeLessThan(1751);
    expect(s[0].paidTestAuthorized).toBe(false);
    expect(s[1].productionRoutingAuthorized).toBe(false);
  });
  it.each([
    {models:[]},
    {models:[{...MODELS[0],listedInputUsdPerMillion:0}]},
    {models:[{...MODELS[0],listedOutputUsdPerMillion:NaN}]},
    {models:[MODELS[0],MODELS[0]]},
    {models:[{...MODELS[0],source:'not-a-url'}]},
    {completionCaps:[0,512,128]},
    {completionCaps:[1537,512,128]},
    {completionCaps:[128,512]},
  ])('rejects unverified or malformed assumptions %j',data=>{
    expect(()=>screen(data)).toThrow('C08_ALT_MODEL_UNVERIFIED_SNAPSHOT_HOLD');
  });
});
