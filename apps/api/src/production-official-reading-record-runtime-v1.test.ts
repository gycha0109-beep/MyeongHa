import { describe,expect,it,vi } from 'vitest';
import { createProductionOfficialReadingRecordRuntimeV1 } from './production-official-reading-record-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const SUBJECT='22222222-2222-4222-8222-222222222222';
const READING='44444444-4444-4444-8444-444444444444';
const SESSION='55555555-5555-4555-8555-555555555555';
const GUEST='guest-runtime-'+'x'.repeat(32);
const ENV={
  MYEONGHA_DATABASE_URL:'postgresql://myeongha_app:strong-password@db.example.com:5432/myeongha?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL:'myeongha_app',
  MYEONGHA_DATABASE_TLS_PEER_MODE:'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:'-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL:'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY:'supabase-server-key-123456789',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:'g'.repeat(32),
};
const record={
  readingId:READING,readingSessionId:SESSION,sajuDomain:'career',
  readingContractVersion:'myeonghwa-product-reading-response-v2',
  productResponseState:'delivered',
  responseSnapshotJsonb:{responseVersion:'myeonghwa-product-reading-response-v2',
    state:'delivered',reading:{readingId:READING,sections:[]}},
  responseHash:'sha256:stored-reading',readerCharacterIds:['seyeon'],
  completedAt:'2026-09-23T00:01:00.000Z',
};
function pool():PostgresSubjectPoolV1{
  return {async connect(){return {
    async query<Row>(text:string,params?:readonly unknown[]){
      if(text==='BEGIN'||text==='COMMIT'||text==='ROLLBACK'||
        text.startsWith('SET LOCAL ROLE')||
        text.includes('assert_myeongha_subject_context_v1'))return{rows:[] as Row[]};
      if(text.includes('begin_guest_subject_context_v1')){
        expect(String(params?.[0])).toMatch(/^myeongha-guest-bearer-hmac-sha256-v1:[0-9a-f]{64}$/u);
        return{rows:[{subjectId:SUBJECT,subjectKind:'guest'}] as Row[]};
      }
      if(text.includes('qry_official_reading_record_runtime_v1')){
        expect(params).toEqual([SUBJECT,READING]);
        return{rows:[record] as Row[]};
      }
      throw Error('Unexpected Official Reading runtime query: '+text);
    },
    release(){},
  };}};
}
const request=(token:string|null=GUEST)=>new Request(
  'https://myeongha.internal/api/readings?readingId='+READING,
  {headers:token===null?{}:{Authorization:'Bearer '+token}},
);
describe('production Official Reading record runtime optional analytics',()=>{
  it('joins real verified-Subject archive read and opt-in completion observer, without mounting a route',async()=>{
    const observe=vi.fn(async (_request:Request,id:string):Promise<'inserted'>=>{
      expect(id).toBe(READING);return 'inserted';
    });
    const runtime=createProductionOfficialReadingRecordRuntimeV1({
      env:ENV,pool:pool(),verifiedReadingAnalytics:{record:observe},
    });
    const result=await runtime.handleRequest({
      request:request(),requestId:'req-official-record-test',
      serverTime:'2026-09-23T00:02:00.000Z',
    });
    expect(result.status).toBe(200);
    expect(observe).toHaveBeenCalledTimes(1);
    expect((await result.json() as {data:{readingId:string}}).data.readingId).toBe(READING);
    const anonymous=await runtime.handleRequest({
      request:request(null),requestId:'req-no-identity',
      serverTime:'2026-09-23T00:02:00.000Z',
    });
    expect(anonymous.status).toBe(401);
    expect(observe).toHaveBeenCalledTimes(1);
    await runtime.close();
  });
  it('leaves analytics inactive unless the server explicitly supplies its adapter',async()=>{
    const runtime=createProductionOfficialReadingRecordRuntimeV1({env:ENV,pool:pool()});
    const response=await runtime.handleRequest({
      request:request(),requestId:'req-official-no-telemetry',
      serverTime:'2026-09-23T00:02:00.000Z',
    });
    expect(response.status).toBe(200);
    await runtime.close();
  });
  it('rejects invalid production DB/TLS identity before opening an injected pool',()=>{
    const connect=vi.fn(async()=>{throw Error('must not connect');});
    expect(()=>createProductionOfficialReadingRecordRuntimeV1({
      env:{...ENV,MYEONGHA_DATABASE_TLS_PEER_MODE:'disable'},pool:{connect},
    })).toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});
