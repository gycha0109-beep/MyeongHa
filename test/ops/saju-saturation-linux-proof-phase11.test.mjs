import { describe, expect, it } from 'vitest';
import {
  validateSaturationLinuxProof, verifySaturationLinuxProofFile,
} from '../../scripts/operations/verify-saju-saturation-linux-proof-phase11.mjs';

const MAIN = 'a'.repeat(40);
function fakeLinuxProof() {
  const rates = Array.from({ length:2 },(_,round) => [400,800,1200,1600].map(rate => ({
    targetRps: rate, round: round+1, intervalSeconds:15,
    wavesPerSecond:100,waveSize:rate/100,
    plannedSlots:rate*15,attempted:rate*15,successfulCalculations:rate*15,
    non200:0,transportFailures:0,invalidResponses:0,
    skippedSchedulingLag:0,skippedInFlightCap:0,maxInFlightObserved:8,
    successfulP50Ms:1,successfulP95Ms:2,successfulP99Ms:3,
    achievedSuccessRps:rate,observedSchedulingWindowMs:15000,
    observedIncludingDrainMs:15001,serviceCpuUsecDelta:100000,
    serviceCpuThrottledPeriodsDelta:0,serviceCpuThrottledUsecDelta:0,
    servicePeakMemoryBytes:48000000,driverCpuUsecDelta:200000,
    driverCpuThrottledPeriodsDelta:0,driverCpuThrottledUsecDelta:0,
    driverPeakMemoryBytes:50000000,
  }))).flat();
  return {
    schema:'myeongha-ops-saju-split-cgroup-controlled-saturation-phase11-v1',
    status:'OBSERVED_BOUNDED_SPLIT_CGROUP_SATURATION',
    sourceSha:'9807ce89c08afc61b587560d515a475efd819032',
    actualSajuProductionHostUsed:true,syntheticInputOnly:true,
    networkScope:'shared-offline-network-namespace-loopback-only',
    separateResourceCgroups:true,boundedSyntheticProbeOnly:true,
    wavesPerSecond:100,maxInFlightCap:64,
    kernelConstraints:{
      serviceCpuCores:0.5,driverCpuCores:1,
      serviceMemoryLimitBytes:268435456,driverMemoryLimitBytes:268435456,
      serviceSwapLimitBytes:0,driverSwapLimitBytes:0,
    },
    rates,totalPlannedSlots:120000,totalActualAttempts:120000,
    totalSuccessfulCalculations:120000,serviceTotalCpuUsec:800000,
    serviceTotalThrottledPeriods:0,serviceTotalThrottledUsec:0,
    driverTotalCpuUsec:1600000,driverTotalThrottledPeriods:0,
    driverTotalThrottledUsec:0,servicePeakMemoryBytes:48000000,
    driverPeakMemoryBytes:50000000,serviceMemoryOomKills:0,
    driverMemoryOomKills:0,postPressureRecoverySucceeded:true,
    saturationKneeApproved:false,sajuSaturationCeilingProven:false,
    productionSajuCpuMemoryCeilingProven:false,productionCapacityProven:false,
    productionScalingThresholdApproved:false,drReady:false,
    serviceResumptionAllowed:false,outputContainsIdentifiers:false,
    nodeImageDigest:'node@sha256:'+'b'.repeat(64),githubMainSha:MAIN,
  };
}
describe('Independent future raw Linux saturation evidence (no result invented)',()=>{
  it('accepts an exact synthetic fixture with two rounds and never claims Production readiness',()=>{
    expect(validateSaturationLinuxProof(fakeLinuxProof(),MAIN)).toMatchObject({
      planned:120000,attempted:120000,successful:120000,
      skippedScheduling:0,skippedConcurrency:0,
      serviceThrottledPeriods:0,driverThrottledPeriods:0,
      recovery:true,productionReady:false,
    });
  });
  it('rejects fabricated stage timing, throughput, CPU metrics and extra private fields',()=>{
    for (const modify of [
      x=>{x.rates[7].round=1;},
      x=>{x.rates[7].targetRps=2000;},
      x=>{x.rates[7].waveSize=8;},
      x=>{x.rates[7].observedSchedulingWindowMs=1234;},
      x=>{x.rates[7].successfulCalculations=24001;},
      x=>{x.rates[7].skippedInFlightCap=-1;},
      x=>{x.rates[7].maxInFlightObserved=65;},
      x=>{x.rates[7].successfulP95Ms=9;x.rates[7].successfulP99Ms=3;},
      x=>{x.rates[7].achievedSuccessRps=2200;},
      x=>{x.rates[7].servicePeakMemoryBytes=300000000;},
      x=>{x.rates[7].customerId='123';},
      x=>{x.rates.pop();},
      x=>{x.totalActualAttempts=119999;},
      x=>{x.serviceTotalCpuUsec=1;},
      x=>{x.extra='unauthorized';},
      x=>{x.nodeImageDigest='node:latest';},
      x=>{x.githubMainSha='c'.repeat(40);},
    ]) {
      const proof=fakeLinuxProof();modify(proof);
      expect(()=>validateSaturationLinuxProof(proof,MAIN)).toThrow();
    }
  });
  it('rejects premature approved ceiling/capacity/DR and missing safeguards',()=>{
    for(const key of [
      'saturationKneeApproved','sajuSaturationCeilingProven',
      'productionSajuCpuMemoryCeilingProven','productionCapacityProven',
      'productionScalingThresholdApproved','drReady','serviceResumptionAllowed',
      'outputContainsIdentifiers',
    ]) {
      const proof=fakeLinuxProof();proof[key]=true;
      expect(()=>validateSaturationLinuxProof(proof,MAIN)).toThrow();
    }
    for(const modify of [
      p=>{p.boundedSyntheticProbeOnly=false;},
      p=>{p.networkScope='public';},
      p=>{p.separateResourceCgroups=false;},
      p=>{p.kernelConstraints.serviceCpuCores=4;},
      p=>{p.serviceMemoryOomKills=1;},
      p=>{p.postPressureRecoverySucceeded=false;},
    ]) {
      const proof=fakeLinuxProof();modify(proof);
      expect(()=>validateSaturationLinuxProof(proof,MAIN)).toThrow();
    }
  });
  it('refuses an original evidence file with incorrect SHA256 before reading its contents',()=>{
    expect(()=>verifySaturationLinuxProofFile(
      'docs/operations/SAJU_REAL_ENGINE_SUSTAINED_LINUX_OBSERVATION_20261103.json',
      '0'.repeat(64),MAIN)).toThrow();
  });
});
