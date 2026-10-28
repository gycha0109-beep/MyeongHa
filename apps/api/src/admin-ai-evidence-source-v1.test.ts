import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {adminAiBudgetWindowV1,evaluateAdminAiBudgetV1} from './admin-ai-budget-v1.js';
import {createAdminAiBudgetEvidenceSourcesV1,createAdminAiExactCallBillingEvidenceSourceV1} from './admin-ai-evidence-source-v1.js';
import type {AdminAiBillingEvidenceV1} from './admin-ai-cost-finance-v1.js';

const window=adminAiBudgetWindowV1('2026-10',new Date('2026-11-01T00:00:00Z'));
const encoded=new TextEncoder().encode('fixture upstream data only, not a real bill');
const digest=createHash('sha256').update(encoded).digest('hex');
const billing={source:'provider_billing_export' as const,evidenceSha256:digest,
  from:window.from,toExclusive:window.toExclusive,coverage:'partial' as const,amountMicroUsd:'90000000'};
const fx={currency:'USD/KRW' as const,rateNumerator:1350,rateDenominator:1,
  effectiveFrom:window.from,effectiveTo:window.toExclusive,sourceSha256:digest};

describe('trusted, source-bound A4 cost evidence loader',()=>{
  it('keeps external evidence absent without configured vendor or FX sources',async()=>{
    const source=createAdminAiBudgetEvidenceSourcesV1();
    expect(await source.billing(window)).toBeUndefined();
    expect(await source.fx(window)).toBeUndefined();
    const result=evaluateAdminAiBudgetV1({window,buckets:[],workloadCoverage:[]});
    expect(result.confirmedMicroKrw).toBeNull();
    expect(result.warnings).toEqual([]);
  });
  it('verifies bytes before parsing and connects only source-bound totals and dated rates',async()=>{
    const parseBilling=vi.fn(()=>billing),parseFx=vi.fn(()=>fx);
    const src=createAdminAiBudgetEvidenceSourcesV1({
      billing:{load:async()=>({bytes:encoded,expectedSha256:digest,transport:'authenticated_provider_billing_export'}),
        parse:parseBilling},
      fx:{load:async()=>({bytes:encoded,expectedSha256:digest,transport:'authenticated_fx_reference_feed'}),
        parse:parseFx},
    });
    const [b,f]=await Promise.all([src.billing(window),src.fx(window)]);
    expect(parseBilling).toHaveBeenCalledOnce();
    expect(parseFx).toHaveBeenCalledOnce();
    const result=evaluateAdminAiBudgetV1({window,buckets:[],workloadCoverage:[],billing:b!,fx:f!});
    expect(result.billingStatus).toBe('partial');
    expect(result.knownConfirmedMicroKrw).toBe('121500000000');
    expect(result.confirmedMicroKrw).toBeNull();
  });
  it('rejects a forged digest and wrong transport before the vendor parser runs',async()=>{
    const parse=vi.fn(()=>billing);
    const source=createAdminAiBudgetEvidenceSourcesV1({
      billing:{load:async()=>({bytes:encoded,expectedSha256:'f'.repeat(64),transport:'authenticated_provider_billing_export'}),parse},
    });
    await expect(source.billing(window)).rejects.toThrow('digest mismatch');
    expect(parse).not.toHaveBeenCalled();
    const wrong=createAdminAiBudgetEvidenceSourcesV1({
      billing:{load:async()=>({bytes:encoded,expectedSha256:digest,transport:'authenticated_fx_reference_feed'}),parse},
    });
    await expect(wrong.billing(window)).rejects.toThrow('Untrusted');
  });
  it('rejects parser claims that are inconsistent with the authenticated source or Seoul month',async()=>{
    const wrongInvoice=createAdminAiBudgetEvidenceSourcesV1({
      billing:{load:async()=>({bytes:encoded,expectedSha256:digest,transport:'authenticated_provider_billing_export'}),
        parse:()=>({...billing,from:'2026-10-01T00:00:00.000Z'})},
    });
    await expect(wrongInvoice.billing(window)).rejects.toThrow('Unbound');
    const wrongFx=createAdminAiBudgetEvidenceSourcesV1({
      fx:{load:async()=>({bytes:encoded,expectedSha256:digest,transport:'authenticated_fx_reference_feed'}),
        parse:()=>({...fx,effectiveFrom:'2026-10-05T00:00:00.000Z'})},
    });
    await expect(wrongFx.fx(window)).rejects.toThrow('Unbound');
  });
  it('rejects unauthenticated/oversized artifacts without accepting claimed evidence',async()=>{
    const source=createAdminAiBudgetEvidenceSourcesV1({
      billing:{load:async()=>({bytes:new Uint8Array(2*1024*1024+1),expectedSha256:digest,transport:'authenticated_provider_billing_export'}),
        parse:()=>billing},
    });
    await expect(source.billing(window)).rejects.toThrow('Untrusted');
  });
});

const EXACT_ID='123e4567-e89b-42d3-a456-426614174000';
const FOREIGN_ID='123e4567-e89b-42d3-a456-426614174001';
const exactBill:AdminAiBillingEvidenceV1={
  callId:EXACT_ID,provider:'fixture',model:'model-v1',currency:'USD',
  amountMicroUsd:900,match:'exact_call',source:'provider_billing_export',
  evidenceSha256:digest,billedFrom:'2026-10-01T00:00:00Z',billedTo:'2026-11-01T00:00:00Z',
};
const exactArtifact={bytes:encoded,expectedSha256:digest,transport:'authenticated_provider_billing_export' as const};

describe('server-only exact-call provider billing source',()=>{
  it('does not invent a bill for unconfigured sources, duplicated IDs or unavailable exports',async()=>{
    expect(await createAdminAiExactCallBillingEvidenceSourceV1().lookup([EXACT_ID])).toEqual([]);
    await expect(createAdminAiExactCallBillingEvidenceSourceV1().lookup([EXACT_ID,EXACT_ID])).rejects.toThrow('cohort');
    await expect(createAdminAiExactCallBillingEvidenceSourceV1().lookup(['bad-id'])).rejects.toThrow('cohort');
    const absent=createAdminAiExactCallBillingEvidenceSourceV1({load:async()=>null,parse:()=>{throw Error('No export');}});
    expect(await absent.lookup([EXACT_ID])).toEqual([]);
  });
  it('pins authenticated bytes and only returns exact, distinct call lines',async()=>{
    const source=createAdminAiExactCallBillingEvidenceSourceV1({
      load:async ids=>{expect(ids).toEqual([EXACT_ID]);return exactArtifact;},
      parse:()=>[exactBill],
    });
    expect(await source.lookup([EXACT_ID])).toEqual([exactBill]);
    const badDigest=createAdminAiExactCallBillingEvidenceSourceV1({
      load:async()=>({...exactArtifact,expectedSha256:'f'.repeat(64)}),parse:()=>[exactBill],
    });
    await expect(badDigest.lookup([EXACT_ID])).rejects.toThrow('digest mismatch');
    const badTransport=createAdminAiExactCallBillingEvidenceSourceV1({
      load:async()=>({...exactArtifact,transport:'authenticated_fx_reference_feed' as const}),parse:()=>[exactBill],
    });
    await expect(badTransport.lookup([EXACT_ID])).rejects.toThrow('Untrusted');
    for(const claim of [
      {...exactBill,callId:FOREIGN_ID},
      {...exactBill,evidenceSha256:'b'.repeat(64)},
      {...exactBill,match:'aggregate'},
      {...exactBill,amountMicroUsd:-1},
      {...exactBill,billedTo:exactBill.billedFrom},
      {...exactBill,provider:'unverified provider'},
    ]){
      const port=createAdminAiExactCallBillingEvidenceSourceV1({
        load:async()=>exactArtifact,
        parse:()=>[claim as AdminAiBillingEvidenceV1],
      });
      await expect(port.lookup([EXACT_ID])).rejects.toThrow('Unbound');
    }
    const duplicate=createAdminAiExactCallBillingEvidenceSourceV1({load:async()=>exactArtifact,parse:()=>[exactBill,exactBill]});
    await expect(duplicate.lookup([EXACT_ID])).rejects.toThrow('Unbound');
  });
});
