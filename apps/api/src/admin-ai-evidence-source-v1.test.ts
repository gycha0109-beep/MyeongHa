import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {adminAiBudgetWindowV1,evaluateAdminAiBudgetV1} from './admin-ai-budget-v1.js';
import {createAdminAiBudgetEvidenceSourcesV1} from './admin-ai-evidence-source-v1.js';

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
