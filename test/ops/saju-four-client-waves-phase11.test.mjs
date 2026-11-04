import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateFourClientWavesReport } from '../../scripts/operations/validate-isolated-saju-four-client-waves-phase11.mjs';

function proof() {
  const stage = {
    profile:'four-client-waves-15m',
    durationSeconds:900,targetRps:4,concurrencyLimit:4,clientWaveSize:4,
    plannedSlots:3600,attempted:3600,successfulCalculations:3600,
    non200:0,transportFailures:0,invalidResponses:0,
    skippedSchedulingLag:0,skippedInFlightCap:0,maxInFlightObserved:4,
    successfulP50Ms:1,successfulP95Ms:2,successfulP99Ms:3,
    achievedSuccessRps:4,
    observedSchedulingWindowMs:900000,observedIncludingDrainMs:900001,
    serviceCpuUsecDelta:1000000,serviceCpuThrottledPeriodsDelta:0,
    serviceCpuThrottledUsecDelta:0,servicePeakMemoryBytes:47000000,
    driverCpuUsecDelta:1500000,driverCpuThrottledPeriodsDelta:0,
    driverCpuThrottledUsecDelta:0,driverPeakMemoryBytes:51000000,
  };
  return {
    schema:'myeongha-ops-saju-split-cgroup-four-client-waves-phase11-v1',
    status:'OBSERVED_FOUR_CLIENT_WAVES',
    sourceSha:'9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed:true,syntheticInputOnly:true,
    networkScope:'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups:true,clientWaveSize:4,
    kernelConstraints:{
      serviceCpuCores:0.5,driverCpuCores:1,
      serviceMemoryLimitBytes:268435456,driverMemoryLimitBytes:268435456,
      serviceSwapLimitBytes:0,driverSwapLimitBytes:0,
    },
    phases:[stage],totalPlannedSlots:3600,totalActualAttempts:3600,
    totalSuccessfulCalculations:3600,serviceTotalCpuUsec:1000000,
    serviceTotalThrottledPeriods:0,serviceTotalThrottledUsec:0,
    driverTotalCpuUsec:1500000,driverTotalThrottledPeriods:0,
    driverTotalThrottledUsec:0,servicePeakMemoryBytes:47000000,
    driverPeakMemoryBytes:51000000,serviceMemoryOomKills:0,driverMemoryOomKills:0,
    postPressureRecoverySucceeded:true,
    saturationKneeApproved:false,sajuSaturationCeilingProven:false,
    productionSajuCpuMemoryCeilingProven:false,productionCapacityProven:false,
    productionScalingThresholdApproved:false,drReady:false,serviceResumptionAllowed:false,
    outputContainsIdentifiers:false,
  };
}

describe('Phase 11 four overlapping client-request wave evidence (NOT server CPU parallelism)',()=>{
  it('requires exactly 900s of four initiated client operations each second',()=>{
    const p=proof();
    expect(validateFourClientWavesReport(p)).toMatchObject({
      status:'OBSERVED_FOUR_CLIENT_WAVES',totalPlannedSlots:3600,
      totalActualAttempts:3600,totalSuccessfulCalculations:3600,
    });
  });
  it('rejects completed source/elapsed/concurrency/slot falsification',()=>{
    for(const edit of [
      x=>{x.clientWaveSize=8;},
      x=>{x.phases[0].clientWaveSize=1;},
      x=>{x.phases[0].maxInFlightObserved=1;},
      x=>{x.phases[0].durationSeconds=100;},
      x=>{x.phases[0].observedSchedulingWindowMs=899;},
      x=>{x.phases[0].attempted=3599;},
      x=>{x.phases[0].successfulCalculations=3601;},
      x=>{x.phases[0].skippedInFlightCap=-1;},
      x=>{x.phases[0].successfulP95Ms=4;x.phases[0].successfulP99Ms=2;},
      x=>{x.phases[0].achievedSuccessRps=500;},
      x=>{x.phases[0].driverPeakMemoryBytes=300000000;},
      x=>{x.serviceTotalCpuUsec=1;},
      x=>{x.sourceSha='a'.repeat(40);},
      x=>{x.status='BLOCKED_INCOMPLETE';},
    ]) {
      const p=proof();edit(p);
      expect(()=>validateFourClientWavesReport(p)).toThrow();
    }
  });
  it('retains all production and Hosted DR denial gates and isolated containers',()=>{
    for(const key of [
      'drReady','serviceResumptionAllowed','productionCapacityProven',
      'saturationKneeApproved','sajuSaturationCeilingProven',
      'productionSajuCpuMemoryCeilingProven','productionScalingThresholdApproved',
      'outputContainsIdentifiers',
    ]) {
      const p=proof();p[key]=true;
      expect(()=>validateFourClientWavesReport(p)).toThrow();
    }
    for(const change of [
      p=>{p.actualSajuProductionHostUsed=false;},
      p=>{p.syntheticInputOnly=false;},
      p=>{p.networkScope='internet';},
      p=>{p.separateResourceCgroups=false;},
      p=>{p.postPressureRecoverySucceeded=false;},
      p=>{p.serviceMemoryOomKills=1;},
      p=>{p.kernelConstraints.serviceCpuCores=4;},
    ]) {
      const p=proof();change(p);
      expect(()=>validateFourClientWavesReport(p)).toThrow();
    }
  });
  it('reuses old main-only workflow and forces four within each scheduled wave',()=>{
    const workflow=readFileSync('.github/workflows/saju-isolated-rate-ladder-phase11.yml','utf8');
    const driver=readFileSync('scripts/operations/measure-isolated-saju-sustained-phase11.mjs','utf8');
    const runner=readFileSync('scripts/operations/run-isolated-saju-split-rate-ladder-phase11.mjs','utf8');
    expect(workflow).toContain('- four-client-waves');
    expect(workflow).toContain("inputs.experiment == 'four-client-waves'");
    expect(workflow).toContain('isolated-saju-four-client-waves-phase11-');
    expect(workflow).toContain('default: shared');
    expect(workflow).not.toContain('pull_request:');
    expect(runner).toContain("'--network=none'");
    expect(runner).toContain("'--network=container:' + cid");
    expect(runner).toContain("import { validateFourClientWavesReport } from './validate-isolated-saju-four-client-waves-phase11.mjs'");
    expect(runner).toContain('validateFourClientWavesReport(JSON.parse(stdout))');
    expect(runner).not.toContain('validateSajuFourClientWavesReport');
    expect(driver).toContain('Math.floor(slot / 4)');
    expect(driver).toContain('pending.add(task)');
    expect(driver).toContain('maxInFlightObserved === 4');
    expect(driver).toContain('AbortSignal.timeout(2500)');
  });
});
