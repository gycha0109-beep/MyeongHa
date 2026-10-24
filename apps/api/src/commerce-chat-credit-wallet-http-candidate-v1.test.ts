import {describe,expect,it} from 'vitest';
import {
  handleMemberChatCreditWalletCandidateV1,
} from './commerce-chat-credit-wallet-http-candidate-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {IdentityEvidenceVerificationPortV1} from './current-subject-profile-http.js';

const subject='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const requestId='req-1';
function fixture(kind:'member'|'guest'|null) {
  const sql:string[]=[];
  const pool:PostgresSubjectPoolV1={
    async connect(){
      return {
        async query<Row>(query:string) {
          sql.push(query);
          const rows=query.includes('begin_member_subject_context')
            ?[{subjectId:subject,subjectKind:'member'}]
            :query.includes('internal_qry_chat_credit_balance')
            ?[{availableCredits:'40',totalCredits:'50'}]
            :[];
          return {rows:rows as readonly Row[]};
        },
        release(){},
      };
    },
  };
  const verifier:IdentityEvidenceVerificationPortV1={
    async verifyRequestIdentity(){
      return kind==='member'?{kind:'member',verifiedAuthUserId:user}
        :kind==='guest'?{kind:'guest',verifiedGuestTokenHash:'hash'}:null;
    },
  };
  return {pool,verifier,sql};
}
describe('credit wallet read candidate',()=>{
  it('reads real canonical Member balance and returns unsaleable topup',async()=>{
    const f=fixture('member');
    const result=await handleMemberChatCreditWalletCandidateV1({
      request:new Request('https://example.test/api/me/credits'),
      requestId,serverTime:'2026-10-24T14:00:00.000Z',
      identityEvidenceVerifier:f.verifier,pool:f.pool,
    });
    expect(result.status).toBe(200);
    const payload=await result.json();
    expect(payload.data).toMatchObject({
      availableCredits:40,totalCredits:50,requiredCredits:10,
      insufficient:false,
      topUp:{amountMinor:1900,creditQuantity:300,saleable:false,
        checkoutRoute:null},
    });
    expect(f.sql.some(s=>s.includes('begin_member_subject_context'))).toBe(true);
    expect(f.sql.some(s=>s.includes('internal_qry_chat_credit_balance'))).toBe(true);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects unauthenticated access before DB',async()=>{
    const f=fixture(null);
    const result=await handleMemberChatCreditWalletCandidateV1({
      request:new Request('https://example.test/api/me/credits'),
      requestId,serverTime:'2026-10-24T14:00:00.000Z',
      identityEvidenceVerifier:f.verifier,pool:f.pool,
    });
    expect(result.status).toBe(401);
    expect(f.sql).toHaveLength(0);
  });
  it('rejects Guest wallet read before DB',async()=>{
    const f=fixture('guest');
    const result=await handleMemberChatCreditWalletCandidateV1({
      request:new Request('https://example.test/api/me/credits'),
      requestId,serverTime:'2026-10-24T14:00:00.000Z',
      identityEvidenceVerifier:f.verifier,pool:f.pool,
    });
    expect(result.status).toBe(403);
    expect(f.sql).toHaveLength(0);
  });
});
