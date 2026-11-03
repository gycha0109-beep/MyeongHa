import { describe, expect, it } from 'vitest';
import { validateSustainedLinuxProof } from '../../scripts/operations/verify-saju-sustained-linux-proof-phase11.mjs';

const MAIN = 'a'.repeat(40);
function report() {
  const phases = [
    { profile:'single-user-5m', durationSeconds:300,targetRps:1,concurrencyLimit:1,plannedSlots:300 },
    { profile:'normal-concurrency-15m',durationSeconds:900,targetRps:4,concurrencyLimit:4,plannedSlots:3600 },
  ].map(p => ({
    ...p,attempted:p.plannedSlots,successfulCalculations:p.plannedSlots,
    non200:0,transportFailures:0,invalidResponses:0,skippedSchedulingLag:0,skippedInFlightCap:0,
    maxInFlightObserved:1,
    successfulP50Ms:1,successfulP95Ms:2,successfulP99Ms:3,
    achievedSuccessRps:p.targetRps,
    observedSchedulingWindowMs:p.durationSeconds*1000,
    observedIncludingDrainMs:p.durationSeconds*1000+1,
    serviceCpuUsecDelta:100000,serviceCpuThrottledPeriodsDelta:0,
    serviceCpuThrottledUsecDelta:0,servicePeakMemoryBytes:44000000,
    driverCpuUsecDelta:120000,driverCpuThrottledPeriodsDelta:0,
    driverCpuThrottledUsecDelta:0,driverPeakMemoryBytes:46000000,
  }));
  return {
    schema:'myeongha-ops-saju-split-cgroup-sustained-phase11-v1',
    status:'OBSERVED_SUSTAINED_REAL_SAJU',
    sourceSha:'9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed:true,syntheticInputOnly:true,
    networkScope:'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups:true,
    kernelConstraints:{
      serviceCpuCores:0.5,driverCpuCores:1,
      serviceMemoryLimitBytes:268435456,driverMemoryLimitBytes:268435456,
      serviceSwapLimitBytes:0,driverSwapLimitBytes:0,
    },
    phases,totalPlannedSlots:3900,totalActualAttempts:3900,totalSuccessfulCalculations:3900,
    serviceTotalCpuUsec:200000,serviceTotalThrottledPeriods:0,serviceTotalThrottledUsec:0,
    driverTotalCpuUsec:240000,driverTotalThrottledPeriods:0,driverTotalThrottledUsec:0,
    servicePeakMemoryBytes:44000000,driverPeakMemoryBytes:46000000,
    serviceMemoryOomKills:0,driverMemoryOomKills:0,
    postPressureRecoverySucceeded:true,
    saturationKneeApproved:false,sajuSaturationCeilingProven:false,
    productionSajuCpuMemoryCeilingProven:false,productionCapacityProven:false,
    productionScalingThresholdApproved:false,drReady:false,serviceResumptionAllowed:false,
    outputContainsIdentifiers:false,
    nodeImageDigest:'node@sha256:'+'b'.repeat(64),
    githubMainSha:MAIN,
  };
}
describe('Independent sustained real-Saju Linux evidence accounting',()=>{
  it('requires two real 5m/15m stages with separate cgroups and correct counts',()=>{
    expect(validateSustainedLinuxProof(report(),MAIN)).toMatchObject({
      planned:3900,attempted:3900,successful:3900,
      skippedScheduling:0,skippedConcurrency:0,
      serviceCpuUsec:200000,driverCpuUsec:240000,
      recovery:true,productionReady:false,
    });
  });
  it('rejects identity mismatches, wrong resource cgroups and approval flags',()=>{
    for(const patch of [
      {sourceSha:'c'.repeat(40)}, {githubMainSha:'c'.repeat(40)},
      {nodeImageDigest:'node:latest'}, {status:'BLOCKED_INCOMPLETE'},
      {networkScope:'public'}, {separateResourceCgroups:false},
      {localValidationOnly:true},
      {saturationKneeApproved:true},{productionCapacityProven:true},
      {drReady:true},{serviceResumptionAllowed:true},
      {outputContainsIdentifiers:true},{postPressureRecoverySucceeded:false},
      {serviceMemoryOomKills:1},{driverMemoryOomKills:1},
      {totalPlannedSlots:3899},{totalSuccessfulCalculations:3901},
      {phases:report().phases.slice(0,1)},
    ]) expect(()=>validateSustainedLinuxProof({...report(),...patch},MAIN)).toThrow();
    const bad=report();bad.kernelConstraints.serviceCpuCores=1;
    expect(()=>validateSustainedLinuxProof(bad,MAIN)).toThrow();
  });
  it('rejects missing elapsed minutes, false success, skipped slots and resource metric corruption',()=>{
    const corrupt=change=>{
      const p=report();change(p.phases[1],p);
      expect(()=>validateSustainedLinuxProof(p,MAIN)).toThrow();
    };
    corrupt(x=>{x.observedSchedulingWindowMs=1000;});
    corrupt(x=>{x.durationSeconds=30;});
    corrupt(x=>{x.concurrencyLimit=16;});
    corrupt(x=>{x.plannedSlots=30;});
    corrupt(x=>{x.successfulCalculations=3601;});
    corrupt(x=>{x.skippedSchedulingLag=-1;});
    corrupt(x=>{x.maxInFlightObserved=10;});
    corrupt(x=>{x.successfulP95Ms=5;x.successfulP99Ms=2;});
    corrupt(x=>{x.achievedSuccessRps=100;});
    corrupt(x=>{x.serviceCpuUsecDelta=-1;});
    corrupt(x=>{x.driverPeakMemoryBytes=300000000;});
    corrupt(x=>{x.subjectId='123';});
    corrupt((x,p)=>{p.serviceTotalCpuUsec=1;});
  });
});
