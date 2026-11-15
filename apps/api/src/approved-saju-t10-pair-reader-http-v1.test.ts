import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('./postgres-approved-saju-pair-reader-v1.js',()=>({
  readPostgresApprovedSajuT10PairReaderV1:mocks.read,
}));
import {
  createApprovedSajuT10PairReaderHttpV1,
  APPROVED_SAJU_PAIR_READER_PATH_V1,
} from './approved-saju-t10-pair-reader-http-v1.js';

const ORIGIN='https://myeongha.example';
const PURCHASE='11111111-1111-4111-8111-111111111111';
const READING='22222222-2222-4222-8222-222222222222';
const AUTH='33333333-3333-4333-8333-333333333333';
const trust={
  issuer:'saju',audience:'myeongha',keyId:'key-1',engineVersion:'test-v1',
  verificationKey:generateKeyPairSync('ed25519').publicKey,
};
const pool={} as PostgresSubjectPoolV1;
function host(authorized=true) {
  return createApprovedSajuT10PairReaderHttpV1({
    origin:ORIGIN,pool,trusts:[trust],
    verifyRequestIdentity:async()=>authorized?{
      kind:'member' as const,verifiedAuthUserId:AUTH,
    }:null,
  });
}
const request=(body:unknown,origin=ORIGIN)=>new Request(ORIGIN+APPROVED_SAJU_PAIR_READER_PATH_V1,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify(body),
});
afterEach(()=>mocks.read.mockReset());

describe('purchased T10 pair Reader reread HTTP boundary',()=>{
  it('requires a verified member and never accepts a caller subject identity',async()=>{
    mocks.read.mockResolvedValue({state:'signed_pair_archive_reopened',readingId:READING,
      readerCharacterId:'seyeon',materialHash:'a'.repeat(64),
      display:{kind:'delivered',steps:[{title:'관계',primary:'근거에 따른 해석',supporting:[],structure:[]}]}});
    const input={purchaseIntentId:PURCHASE,readingId:READING,readerCharacterId:'seyeon'};
    expect((await host(false).handleRequest(request(input)))?.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    const wrong={...input,subjectId:AUTH};
    expect((await host().handleRequest(request(wrong)))?.status).toBe(400);
    const response=await host().handleRequest(request(input));
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read.mock.calls[0]?.[0]).toMatchObject({
      purchaseIntentId:PURCHASE,readingId:READING,readerCharacterId:'seyeon',
      verifiedEvidence:{kind:'member',verifiedAuthUserId:AUTH},
    });
    expect(mocks.read.mock.calls[0]?.[0]).not.toHaveProperty('subjectId');
    expect((await response?.json()).data).toMatchObject({
      state:'signed_pair_archive_reopened',readingId:READING,
    });
  });
  it('denies other-origin requests and silently refuses missing purchase/consent',async()=>{
    const input={purchaseIntentId:PURCHASE,readingId:READING,readerCharacterId:'seyeon'};
    expect((await host().handleRequest(request(input,'https://other.example')))?.status).toBe(403);
    mocks.read.mockResolvedValue(null);
    expect((await host().handleRequest(request(input)))?.status).toBe(404);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
