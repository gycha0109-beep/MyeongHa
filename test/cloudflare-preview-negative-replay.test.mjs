import { describe, expect, it } from 'vitest';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import {
  STAGE9_NEGATIVE_REPLAY_PROBES_V1,
  STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1,
} from '../scripts/cloudflare-preview-negative-replay.mjs';

describe('Stage 9 synthetic duplicate POST / Reader / unported PortOne replay fences',()=>{
  it('uses a fixed safe, denied-only route inventory with identical webhook body',()=>{
    const ids=STAGE9_NEGATIVE_REPLAY_PROBES_V1.map(x=>x.id);
    expect(ids).toEqual([
      'auth.sign-in.duplicate',
      'seyeon.turn-replay.duplicate',
      'commerce.webhook.first',
      'commerce.webhook.duplicate',
    ]);
    expect(STAGE9_NEGATIVE_REPLAY_PROBES_V1.map(x=>x.expectedStatus))
      .toEqual([404,503,404,404]);
    const [auth,reader,payment,duplicate]=STAGE9_NEGATIVE_REPLAY_PROBES_V1;
    expect(auth.path).toBe('/api/auth/sign-in');
    expect(matchCloudflareApiRoute(auth.path)?.id).toBe('api.auth.sign-in');
    expect(matchCloudflareApiRoute(new URL(reader.path,'https://synthetic.invalid').pathname)?.id)
      .toBe('rewrite.chat.turns');
    expect(payment.path).toBe(duplicate.path);
    expect(payment.body).toBe(duplicate.body);
    expect(payment.path).toBe('/api/commerce/portone/webhook');
    expect(matchCloudflareApiRoute(payment.path)).toBeNull();
    for(const probe of STAGE9_NEGATIVE_REPLAY_PROBES_V1){
      expect(probe.path).toMatch(/^\/api\//);
      expect(probe.body).not.toContain('sk-');
      expect(probe.body).not.toContain('Bearer');
      expect(probe.body).not.toContain('paymentId');
      expect(probe.body).not.toContain('transactionId');
    }
  });
  it('requires all four safe denial codes and does not call a provider',()=>{
    expect(STAGE9_NEGATIVE_REPLAY_FENCE_VALUES_V1).toEqual({
      'auth.sign-in.duplicate':'DENY_404',
      'seyeon.turn-replay.duplicate':'HOLD_503',
      'commerce.webhook.first':'DENY_404',
      'commerce.webhook.duplicate':'DENY_404',
    });
  });
});
