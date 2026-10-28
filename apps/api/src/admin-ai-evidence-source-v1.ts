import { createHash } from 'node:crypto';
import type { AdminAiFxEvidenceV1 } from './admin-ai-cost-finance-v1.js';
import type { AdminAiBudgetBillingV1, AdminAiBudgetWindowV1 } from './admin-ai-budget-v1.js';

/**
 * Verified server-side evidence ingestion boundary. A SHA256 digest checks
 * artifact integrity; it does NOT authenticate a vendor by itself. The
 * supplied loader MUST have already authenticated the upstream transport and
 * independently pinned the expected digest. Never expose this port to a
 * browser, owner-upload form, or public HTTP endpoint.
 */
export interface AdminAiSourceArtifactV1 {
  readonly bytes: Uint8Array;
  readonly expectedSha256: string;
  readonly transport:
    | 'authenticated_provider_billing_export'
    | 'authenticated_fx_reference_feed';
}
export interface AdminAiBudgetEvidenceSourcesV1 {
  readonly billing: (window: AdminAiBudgetWindowV1) => Promise<AdminAiBudgetBillingV1 | undefined>;
  readonly fx: (window: AdminAiBudgetWindowV1) => Promise<AdminAiFxEvidenceV1 | undefined>;
}

const SHA256=/^[a-f0-9]{64}$/u;
const MAX_BYTES=2*1024*1024;
function verifiedBytes(
  value: AdminAiSourceArtifactV1,
  required: AdminAiSourceArtifactV1['transport'],
):{bytes:Uint8Array;sha256:string}{
  if(!value || value.transport!==required ||
    !(value.bytes instanceof Uint8Array) || value.bytes.byteLength<1 ||
    value.bytes.byteLength>MAX_BYTES || !SHA256.test(value.expectedSha256)) {
    throw Error('Untrusted AI finance evidence source');
  }
  const actual=createHash('sha256').update(value.bytes).digest('hex');
  if(actual!==value.expectedSha256)throw Error('AI finance evidence digest mismatch');
  return{bytes:value.bytes,sha256:actual};
}
function requireTime(value:string):number{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value))throw Error('Invalid AI evidence time');
  const t=Date.parse(value);if(!Number.isFinite(t)||new Date(t).toISOString()!==new Date(value).toISOString())throw Error('Invalid AI evidence time');
  return t;
}
function validFx(source:AdminAiFxEvidenceV1,window:AdminAiBudgetWindowV1,digest:string):void{
  if(source?.currency!=='USD/KRW'||source.sourceSha256!==digest||
    !Number.isSafeInteger(source.rateNumerator)||source.rateNumerator<=0||
    !Number.isSafeInteger(source.rateDenominator)||source.rateDenominator<=0||
    requireTime(source.effectiveFrom)>requireTime(window.from)||
    requireTime(source.effectiveTo)<requireTime(window.observedThrough)) {
    throw Error('Unbound AI FX evidence');
  }
}
function validBilling(source:AdminAiBudgetBillingV1,window:AdminAiBudgetWindowV1,digest:string):void{
  if(source?.source!=='provider_billing_export'||source.evidenceSha256!==digest||
    source.from!==window.from||source.toExclusive!==window.toExclusive||
    !['partial','complete'].includes(source.coverage)||
    typeof source.amountMicroUsd!=='string'||
    !/^(?:0|[1-9]\d{0,29})$/u.test(source.amountMicroUsd)) {
    throw Error('Unbound AI provider billing export');
  }
}

/**
 * Vendor-specific source parsers remain server-owned. No provider transport
 * or exchange-rate feed is invented here. Until real authenticated loaders
 * are explicitly supplied, both functions resolve undefined and the budget
 * continues to render confirmed amounts and FX as unmeasured.
 */
export function createAdminAiBudgetEvidenceSourcesV1(input:{
  readonly billing?:{
    readonly load:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiSourceArtifactV1|null>;
    readonly parse:(bytes:Uint8Array,window:AdminAiBudgetWindowV1)=>AdminAiBudgetBillingV1;
  };
  readonly fx?:{
    readonly load:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiSourceArtifactV1|null>;
    readonly parse:(bytes:Uint8Array,window:AdminAiBudgetWindowV1)=>AdminAiFxEvidenceV1;
  };
}={}):AdminAiBudgetEvidenceSourcesV1 {
  return Object.freeze({
    async billing(window){
      if(!input.billing)return undefined;
      const artifact=await input.billing.load(window);
      if(artifact===null)return undefined;
      const verified=verifiedBytes(artifact,'authenticated_provider_billing_export');
      const parsed=input.billing.parse(verified.bytes,window);
      validBilling(parsed,window,verified.sha256);
      return Object.freeze(parsed);
    },
    async fx(window){
      if(!input.fx)return undefined;
      const artifact=await input.fx.load(window);
      if(artifact===null)return undefined;
      const verified=verifiedBytes(artifact,'authenticated_fx_reference_feed');
      const parsed=input.fx.parse(verified.bytes,window);
      validFx(parsed,window,verified.sha256);
      return Object.freeze(parsed);
    },
  });
}
