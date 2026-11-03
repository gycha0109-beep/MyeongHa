import { describe, expect, it } from 'vitest';
import {
  validateFourClientWaveLinuxProof, verifyFourClientWaveFile,
} from '../../scripts/operations/verify-saju-four-client-wave-linux-phase11.mjs';

const MAIN = 'a'.repeat(40);
function fixture() {
  const s = {
    profile:'four-client-waves-15m',durationSeconds:900,targetRps:4,
    concurrencyLimit:4,clientWaveSize:4,plannedSlots:3600,attempted:3600,
    successfulCalculations:3600,non200:0,transportFailures:0,invalidResponses:0,
    skippedSchedulingLag:0,skippedInFlightCap:0,maxInFlightObserved:4,
    successfulP50Ms:1,successfulP95Ms:2,successfulP99Ms:3,
    achievedSuccessRps:4,observedSchedulingWindowMs:900000,
    observedIncludingDrainMs:900001,serviceCpuUsecDelta:3000000,
    serviceCpuThrottledPeriodsDelta:0,serviceCpuThrottledUsecDelta:0,
    servicePeakMemoryBytes:48000000,driverCpuUsecDelta:3500000,
    driverCpuThrottledPeriodsDelta:0,driverCpuThrottledUsecDelta:0,
    driverPeakMemoryBytes:50000000,
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
    phases:[s],totalPlannedSlots:3600,totalActualAttempts:3600,
    totalSuccessfulCalculations:3600,serviceTotalCpuUsec:3000000,
    serviceTotalThrottledPeriods:0,serviceTotalThrottledUsec:0,
    driverTotalCpuUsec:3500000,driverTotalThrottledPeriods:0,
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
describe('Independent original GitHub Linux four-client waves proof', () => {
  it('accepts valid 15m isolated four-outstanding-client measurement without Production approval', () => {
    expect(validateFourClientWaveLinuxProof(fixture(),MAIN)).toMatchObject({
      planned:3600,attempted:3600,success:3600,clientWaveSize:4,
      observedMaxInFlight:4,skippedScheduling:0,skippedConcurrency:0,
      recovery:true,productionReady:false,
    });
  });
  it('rejects invented simultaneous requests, extra identifying fields, wrong raw digest or source', () => {
    const cases = [
      p=>{p.clientWaveSize=2;},
      p=>{p.phases[0].maxInFlightObserved=1;},
      p=>{p.phases[0].observedSchedulingWindowMs=1000;},
      p=>{p.phases[0].attempted=3500;},
      p=>{p.phases[0].successfulCalculations=3601;},
      p=>{p.phases[0].successfulP95Ms=9;p.phases[0].successfulP99Ms=1;},
      p=>{p.phases[0].skippedInFlightCap=-1;},
      p=>{p.phases[0].achievedSuccessRps=400;},
      p=>{p.phases[0].servicePeakMemoryBytes=300000000;},
      p=>{p.serviceTotalCpuUsec=2;},
      p=>{p.phases[0].email='private';},
      p=>{p.productionCapacityProven=true;},
      p=>{p.drReady=true;},
      p=>{p.outputContainsIdentifiers=true;},
      p=>{p.sourceSha='c'.repeat(40);},
      p=>{p.githubMainSha='d'.repeat(40);},
      p=>{p.status='BLOCKED_INCOMPLETE';},
      p=>{p.kernelConstraints.driverCpuCores=2;},
      p=>{p.postPressureRecoverySucceeded=false;},
    ];
    for(const mutate of cases) {
      const p=fixture();mutate(p);
      expect(()=>validateFourClientWaveLinuxProof(p,MAIN)).toThrow();
    }
  });
  it('fails closed on an unverified source-file SHA256', () => {
    expect(() => verifyFourClientWaveFile(
      'docs/operations/SAJU_REAL_ENGINE_SUSTAINED_LINUX_OBSERVATION_20261103.json',
      '0'.repeat(64),MAIN)).toThrow();
  });
});
