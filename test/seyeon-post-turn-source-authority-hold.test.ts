import { describe, expect, it } from 'vitest';
import {
  assertSeyeonPostTurnSourceAuthorityV1,
  processSeyeonPostTurnAnalysisV1,
  SeyeonPostTurnSourceAuthorityHoldV1,
} from '../apps/api/src/seyeon-post-turn-analysis-worker-v1.js';

describe('Production post-turn source authority', () => {
  it('only permits no-source OFF cleanup without a checkpoint', () => {
    expect(() => assertSeyeonPostTurnSourceAuthorityV1('OFF', null))
      .not.toThrow();
    for (const mode of ['SHADOW', 'WRITE_DARK', 'BEHAVIOR_SHADOW', 'LIVE'] as const) {
      expect(() => assertSeyeonPostTurnSourceAuthorityV1(mode, null))
        .toThrow(SeyeonPostTurnSourceAuthorityHoldV1);
    }
    expect(() => assertSeyeonPostTurnSourceAuthorityV1('OFF', {
      schemaVersion: 'seyeon-post-turn-analysis-checkpoint-v1',
      decision: 'relationship_event',
    })).toThrow(SeyeonPostTurnSourceAuthorityHoldV1);
  });

  it('refuses an unverified production job before DB claim or model input', async () => {
    let claimCalls=0;
    const port={
      preflightClaim:async()=> 'hold' as const,
      claim:async()=>{claimCalls++;throw Error('must not claim');},
    };
    await expect(processSeyeonPostTurnAnalysisV1({
      subjectId:'subject',
      outboxEventId:'outbox',
      lockOwner:'worker',
      leaseExpiresAt:'2026-10-30T00:00:00Z',
      outboxPort:port as never,
      extractorProvider:{} as never,
      enforceCurrentSourceAuthority:true,
    })).rejects.toBeInstanceOf(SeyeonPostTurnSourceAuthorityHoldV1);
    expect(claimCalls).toBe(0);
  });

  it('finishes OFF through the owner receipt without claiming or reading message text', async () => {
    let claims=0;
    const result=await processSeyeonPostTurnAnalysisV1({
      subjectId:'subject',outboxEventId:'outbox',
      lockOwner:'worker',leaseExpiresAt:'2026-10-30T00:01:00Z',
      outboxPort:{
        preflightClaim:async()=> 'off_cleanup',
        completeOffWithoutText:async()=>({
          outboxEventId:'outbox',processedAt:'2026-10-30T00:00:00Z',
          reclaimed:false,
        }),
        claim:async()=>{claims++;throw Error('private text must stay in DB');},
      } as never,
      extractorProvider:{} as never,
      enforceCurrentSourceAuthority:true,
    });
    expect(result.decision).toBe('disabled');
    expect(claims).toBe(0);
  });
});
