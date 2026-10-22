import { describe, expect, it } from 'vitest';
import {
  assessCloudflarePreviewOpsStopGateV1,
  CLOUDFLARE_WORKERS_FREE_OPERATING_LIMITS_V1,
} from '../scripts/cloudflare-preview-ops-stop-gate.mjs';
import { summarizeCloudflarePreviewProbeMetricsV1 } from '../scripts/cloudflare-preview-smoke-metrics.mjs';

const SHA='a'.repeat(40);
const healthyMetrics=summarizeCloudflarePreviewProbeMetricsV1([
  {path:'/',expectedStatus:200,actualStatus:200,elapsedMs:2},
  {path:'/api/health',expectedStatus:200,actualStatus:200,elapsedMs:3},
  {path:'/api/me',expectedStatus:404,actualStatus:404,elapsedMs:4},
  {path:'/api/chat/SECRET-THREAD-ID/turns?state=SECRET',expectedStatus:503,
    actualStatus:503,elapsedMs:5},
]);
const accept=(extra={})=>assessCloudflarePreviewOpsStopGateV1({
  metrics:healthyMetrics,expectedCommit:SHA,attestedCommit:SHA,...extra,
});

describe('Cloudflare S-CF2 Stage 9 stop and recovery HOLD (read-only)',()=>{
  it('keeps deny-only Preview when synthetic probes pass but true CPU and billing are unknown',()=>{
    const result=accept();
    expect(result.previewDecision).toBe('ALLOW_DENY_ONLY_PREVIEW');
    expect(result.productionCutover).toBe('HOLD');
    expect(result.freeBudgetEvidence).toBe('INSUFFICIENT');
    expect(result.accountBillingEvidence).toBe('NOT_VERIFIED');
    expect(result.costDecision).toBe('COST_OR_LIMIT_EVIDENCE_HOLD');
    expect(result.recoveryAction).toBe('RETAIN_VERCEL_PRODUCTION_AND_PROTECTED_404_503_HOLDS');
    expect(result.automaticProductionMutation).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('stops for an incorrect deployed SHA even with otherwise green smoke',()=>{
    const r=accept({attestedCommit:'b'.repeat(40)});
    expect(r.previewDecision).toBe('STOP_REHEARSAL');
    expect(r.reasons).toContain('EXACT_PREVIEW_COMMIT_MISMATCH');
    expect(r.productionCutover).toBe('HOLD');
  });

  it('stops for response anomalies and for missing intentional SeYeon 503',()=>{
    const altered=summarizeCloudflarePreviewProbeMetricsV1([
      {path:'/',expectedStatus:200,actualStatus:200,elapsedMs:2},
      {path:'/api/health',expectedStatus:200,actualStatus:429,elapsedMs:3},
      {path:'/api/me',expectedStatus:404,actualStatus:500,elapsedMs:4},
      {path:'/api/chat/private-id/turns',expectedStatus:503,actualStatus:200,elapsedMs:5},
    ]);
    const bad=accept({metrics:altered});
    expect(bad.previewDecision).toBe('STOP_REHEARSAL');
    expect(bad.reasons).toEqual(expect.arrayContaining([
      'SYNTHETIC_HTTP_OR_PROTECTION_FAILURE','SEYEON_503_HOLD_NOT_OBSERVED',
    ]));
    expect(accept({metrics:null}).reasons).toContain('SYNTHETIC_PROBE_EVIDENCE_MISSING');
    expect(accept({metrics:summarizeCloudflarePreviewProbeMetricsV1([])})
      .reasons).toContain('SYNTHETIC_ROUTE_CLASS_UNCHECKED');
  });

  it('evaluates officially bounded Free usage independently of HTTP wall time',()=>{
    expect(CLOUDFLARE_WORKERS_FREE_OPERATING_LIMITS_V1).toMatchObject({
      requestsPerUtcDay:100000,cpuTimePerInvocationMs:10,
      memoryMb:128,externalSubrequestsPerInvocation:50,
    });
    const within={workerRequestsTodayUtc:20,cpuMaxMsPerInvocation:3,
      memoryMaxMb:32,externalSubrequestsMaxPerInvocation:2,
      buildMinutesExhausted:false,accountBillingVerified:false};
    const allowed=accept({usage:within});
    expect(allowed.previewDecision).toBe('ALLOW_DENY_ONLY_PREVIEW');
    expect(allowed.freeBudgetEvidence).toBe('OBSERVED_WITHIN_BOUNDARIES');
    expect(allowed.productionCutover).toBe('HOLD');
    expect(allowed.costDecision).toBe('COST_OR_LIMIT_EVIDENCE_HOLD');
    const billing=accept({usage:{...within,accountBillingVerified:true}});
    expect(billing.costDecision).toBe('USAGE_EVIDENCE_ONLY_OWNER_APPROVAL_REQUIRED');
    expect(billing.productionCutover).toBe('HOLD');
    const capCases=[
      ['workerRequestsTodayUtc',100000,'FREE_DAILY_REQUEST_BUDGET_EXHAUSTED'],
      ['cpuMaxMsPerInvocation',10,'FREE_CPU_BUDGET_UNSAFE'],
      ['memoryMaxMb',128,'FREE_MEMORY_BUDGET_UNSAFE'],
      ['externalSubrequestsMaxPerInvocation',50,'FREE_EXTERNAL_SUBREQUEST_BUDGET_UNSAFE'],
    ];
    for(const [key,value,reason] of capCases){
      const r=accept({usage:{...within,[key]:value}});
      expect(r.previewDecision).toBe('STOP_REHEARSAL');
      expect(r.reasons).toContain(reason);
    }
    expect(accept({usage:{...within,buildMinutesExhausted:true}})
      .reasons).toContain('BUILD_MINUTES_EXHAUSTED');
  });

  it('maps owner-reported security/cost anomalies to STOP without touching production',()=>{
    for(const [flag,expectedCode] of [
      ['credentialRotationFailure','SECRET_ROTATION_FAILURE'],
      ['oauthCallbackFailure','OAUTH_CALLBACK_FAILURE'],
      ['postgresTlsRlsFailure','DB_TLS_RLS_FAILURE'],
      ['protectedResponseExposed','PROTECTED_RESPONSE_EXPOSED'],
      ['providerTimeout','AI_PROVIDER_TIMEOUT'],
      ['paymentReplayRisk','PAYMENT_REPLAY_RISK'],
      ['billableRequestSpike','BILLABLE_REQUEST_SPIKE'],
    ]){
      const result=accept({incidents:{[flag]:true}});
      expect(result.reasons).toContain(expectedCode);
      expect(result.previewDecision).toBe('STOP_REHEARSAL');
      expect(result.automaticProductionMutation).toBe(false);
    }
  });

  it('fails invalid usage data without echoing secrets or interpreting blanks as zero',()=>{
    for(const usage of [
      {cpuMaxMsPerInvocation:'SENSITIVE'}, {workerRequestsTodayUtc:-1},
      {externalSubrequestsMaxPerInvocation:1.5},{memoryMaxMb:Infinity},
      {buildMinutesExhausted:'false'},{accountBillingVerified:'true'},
    ]){
      expect(()=>accept({usage})).toThrow(/Invalid/);
    }
    expect(accept({usage:{cpuMaxMsPerInvocation:0}}).freeBudgetEvidence).toBe('INSUFFICIENT');
    expect(()=>accept({incidents:{oauthCallbackFailure:'FALSE'}})).toThrow(/Invalid/);
  });
});
