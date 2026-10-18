import { describe, expect, it } from 'vitest';
import { resolveMeDispatchTargetForTestV1 } from '../../../api/me.js';

// M1-30: dispatcher-only regression. It must reject Reader-shaped request
// paths and unapproved Receipt/Subject/GUC routing metadata before selecting
// any backend runtime. It is NOT a live authentication or Reader endpoint test.
const SUBJECT='a1290000-0000-4000-8000-000000000013';
const RECEIPT='44444444-4444-4444-8444-444444444444';

describe('M1-30 /api/me public dispatch has no Reader minimal observation route',()=>{
  it.each([
    '/api/reader/unknown-commit',
    '/api/official-reader/unknown-commit',
    '/api/me/reader/unknown-commit',
    '/api/me?__myeongha_reader_unknown_commit=1',
    '/api/me?receiptId='+RECEIPT,
    '/api/me?verifiedSubjectId='+SUBJECT,
    '/api/me?subjectId='+SUBJECT,
    '/api/me?myeongha.subject_id='+SUBJECT,
    '/api/me?role=myeongha_api_executor',
    '/api/readings?__myeongha_records_read=readings&receiptId='+RECEIPT,
  ])('rejects unapproved Reader path or query before choosing any runtime: %s',(pathname)=>{
    const request=new Request('https://myeongha.invalid'+pathname,{
      headers:{
        Authorization:'Bearer synthetic-unverified-token',
        'x-myeongha-subject-id':SUBJECT,
        'x-db-role':'postgres',
        'x-myeongha-subject-guc':SUBJECT,
      },
    });
    expect(resolveMeDispatchTargetForTestV1(request)).toBeNull();
  });
  it('retains the legitimate /api/me route without making Reader special-case reachable',()=>{
    const target=resolveMeDispatchTargetForTestV1(
      new Request('https://myeongha.invalid/api/me'),
    );
    expect(target).toEqual({kind:'profile',route:'/api/me'});
  });
});
