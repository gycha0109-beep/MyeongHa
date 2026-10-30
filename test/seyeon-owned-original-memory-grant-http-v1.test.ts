// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import {
  handleSeyeonOwnedOriginalGrantRequestV1,
  SEYEON_OWNED_ORIGINAL_GRANT_HTTP_V1,
} from '../apps/api/src/seyeon-owned-original-memory-grant-http-v1.js';

const MEMORY = '00000000-0000-4000-8000-000000000001';
const ENDPOINT = `https://test.invalid/api/memories/${MEMORY}/grants/seyeon`;
const metadata = { requestId:'owner-grant-request',serverTime:'2026-10-30T00:00:00Z' };
const member = { kind:'member' as const,verifiedAuthUserId:MEMORY };
const pool = { connect:vi.fn(() => { throw Error('Unexpected database access'); }) };
const valid = { grantChoice:{mode:'character_only',characterId:'seyeon'} };

function request(value: unknown, path = ENDPOINT) {
  return new Request(path, {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),
  });
}
const verifier = () => ({ verifyRequestIdentity:vi.fn(async () => member) });

describe('unmounted S0 Member-owned original-memory Grant route', () => {
  it('does not permit DB writes when server-owned admission is absent', async () => {
    const identityEvidenceVerifier=verifier();
    const createGrant=vi.fn();
    const response=await handleSeyeonOwnedOriginalGrantRequestV1({
      request:request(valid), ...metadata, identityEvidenceVerifier,pool,createGrant,
    });
    expect(SEYEON_OWNED_ORIGINAL_GRANT_HTTP_V1.publicRouteMounted).toBe(false);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(createGrant).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects invalid, expanded or other-character consent before identity and DB', async () => {
    const cases = [
      {},{grantChoice:{mode:'private'}},
      {grantChoice:{mode:'current_characters'}},
      {grantChoice:{mode:'character_only',characterId:'other'}},
      {grantChoice:{mode:'character_only',characterId:'seyeon',extra:true}},
      {grantChoice:{mode:'character_only',characterId:'seyeon'},subjectId:MEMORY},
    ];
    for(const candidate of cases) {
      const identityEvidenceVerifier=verifier();
      const response=await handleSeyeonOwnedOriginalGrantRequestV1({
        request:request(candidate),...metadata,identityEvidenceVerifier,pool,
        approvedDbWriteAdmission:() => true,
      });
      expect(response.status).toBe(400);
      expect(identityEvidenceVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    }
  });

  it('requires current Member before server-owned approval and prevents guest access', async () => {
    for(const evidence of [
      null,
      {kind:'guest' as const,verifiedGuestTokenHash:'test'},
    ]) {
      const admission=vi.fn(() => true);
      const res=await handleSeyeonOwnedOriginalGrantRequestV1({
        request:request(valid),...metadata,pool,
        identityEvidenceVerifier:{verifyRequestIdentity:async () => evidence},
        approvedDbWriteAdmission:admission,
      });
      expect(res.status).toBe(evidence===null?401:403);
      expect(admission).not.toHaveBeenCalled();
    }
  });

  it('returns only a bounded owner-safe result after exact DB receipt', async () => {
    const createGrant=vi.fn(async (input: {memoryItemId:string;grantId:string}) =>
      ({memoryItemId:input.memoryItemId,grantId:input.grantId,
        characterId:'seyeon' as const,replayed:false as const}));
    const result=await handleSeyeonOwnedOriginalGrantRequestV1({
      request:request(valid),...metadata,pool,
      identityEvidenceVerifier:verifier(),
      approvedDbWriteAdmission:() => true,
      createGrant,
    });
    expect(result.status).toBe(200);
    const body=await result.json();
    expect(body.data).toEqual({memoryItemId:MEMORY,characterId:'seyeon',
      currentlyGranted:true,grantState:'active'});
    expect(Object.hasOwn(body.data,'grantId')).toBe(false);
    expect(createGrant).toHaveBeenCalledOnce();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects forged/replayed receipts without disclosing source', async () => {
    const response=await handleSeyeonOwnedOriginalGrantRequestV1({
      request:request(valid),...metadata,pool,
      identityEvidenceVerifier:verifier(),
      approvedDbWriteAdmission:() => true,
      createGrant:async input => ({
        memoryItemId:input.memoryItemId,grantId:input.grantId,
        characterId:'seyeon',replayed:true,
      }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SEYEON_ORIGINAL_GRANT_AUTHORITY_UNAVAILABLE');
  });

  it('rejects locked body without leaking an unhandled exception or auth', async () => {
    const req=request(valid);
    const lock=req.body!.getReader();
    try{
      const identityEvidenceVerifier=verifier();
      const res=await handleSeyeonOwnedOriginalGrantRequestV1({
        request:req,...metadata,pool,identityEvidenceVerifier,
      });
      expect(res.status).toBe(400);
      expect(identityEvidenceVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    }finally{lock.releaseLock();}
  });
});
