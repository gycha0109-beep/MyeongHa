import { describe, it, expect } from 'vitest';
import { runIsolatedA09Attack } from '../scripts/verify-a09-isolated-attack-delivery.mjs';

describe('A09 external-network-isolated attack and notification proof', () => {
  it('uses the real event emitter to prove normal, denied, limited, spike and one-hour repeat suppression', async () => {
    const result = await runIsolatedA09Attack();
    expect(result.pass).toBe(true);
    expect(result.productionChanged).toBe(false);
    expect(result.realProviderAnomalyTriggered).toBe(false);
    expect(result.actualEmitterImported).toBe(true);
    expect(result.realHttpRequests).toBe(222);
    expect(result.httpStatusDistribution).toEqual({ 200: 80, 401: 95, 403: 27, 429: 20 });
    expect(result.structuredSecurityEvents).toBe(190);
    expect(result.baseline.baselineQuietDoesNotNotify).toBe(true);
    expect(result.detectorMirror.spikeDetected).toBe(true);
    expect(result.detectorMirror.recentSecurityEvents).toBe(142);
    expect(result.detectorMirror.sensitivity).toBe(3.5);
    expect(result.delivery.privateLoopbackSinkAccepted).toBe(1);
    expect(result.delivery.repeatSuppressedForOneHour).toBe(true);
    expect(result.privacySafe).toBe(true);
  });
});
