import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({
  query:vi.fn(),scope:vi.fn(),source:vi.fn(),signed:vi.fn(),commit:vi.fn(),
  reader:vi.fn(),
}));
const SUBJECT='11111111-1111-4111-8111-111111111111';
const AUTH='22222222-2222-4222-8222-222222222222';
const PURCHASE='33333333-3333-4333-8333-333333333333';
const JOB='44444444-4444-4444-8444-444444444444';
const READING='55555555-5555-4555-8555-555555555555';
const SESSION='66666666-6666-4666-8666-666666666666';
const ATTEMPT='77777777-7777-4777-8777-777777777777';
const BIRTH='88888888-8888-4888-8888-888888888888';
const TARGET='99999999-9999-4999-8999-999999999999';
const RELEASE='t10-test-release-v1';
const job={
  job_id:JOB,subject_id:SUBJECT,auth_user_id:AUTH,purchase_intent_id:PURCHASE,
  component:'compatibility',release_ref:RELEASE,already_issued:false,
};
let existingAttempt:null|number=null;
let signedCommitted=false;

vi.mock('./postgres-subject-execution.js',()=>({
  executePostgresApprovedSajuIssuerJobTransactionV1:async(
    input:{execute:(client:unknown)=>Promise<unknown>})=>input.execute({query:mocks.query}),
  executePostgresApprovedSajuIssuerTransactionV1:async(
    input:{execute:(context:unknown)=>Promise<unknown>})=>input.execute({
      client:{query:mocks.query},
      resolvedSubject:{subjectKind:'member',subjectId:SUBJECT},
    }),
}));
vi.mock('./postgres-approved-saju-issue-scope-v1.js',()=>({
  readApprovedSajuPairIssueScopeV1:mocks.scope,
}));
vi.mock('./postgres-approved-saju-issuance-v1.js',()=>({
  verifyApprovedSajuPreparedPairIssueV1:mocks.signed,
}));
vi.mock('./postgres-approved-saju-pair-official-commit-v1.js',()=>({
  commitApprovedSajuT10OfficialPairReadingV1:mocks.commit,
}));
vi.mock('./postgres-approved-saju-pair-reader-v1.js',()=>({
  readPostgresApprovedSajuT10PairReaderV1:mocks.reader,
}));
vi.mock('./saju-t10-production-pair-issue-source-v1.js',()=>({
  createSajuT10ProductionPairIssueSourceV1:mocks.source,
}));
import { createApprovedSajuT10PairIssuanceWorkerV1 } from './approved-saju-t10-pair-issuance-worker-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const key=generateKeyPairSync('ed25519').publicKey;
const config=()=>{
  return {
    pool:{} as PostgresSubjectPoolV1,
    sourceOrigin:'https://saju.example',
    sourceBearerToken:'t'.repeat(32),
    trust:{issuer:'saju',audience:'myeongha',keyId:'test-key',
      engineVersion:'test-engine',verificationKey:key},
    releaseRef:RELEASE,
    readerCharacterId:'seyeon' as const,
    engineKey:'saju',
    engineVersion:'test-engine',
  };
};
beforeEach(()=>{
  existingAttempt=null;signedCommitted=false;
  mocks.source.mockReturnValue({issuePreparedPair:vi.fn()});
  mocks.scope.mockResolvedValue({
    releaseRef:RELEASE,sourceRequestHash:'a'.repeat(64),
    birthRevisionId:BIRTH,targetBirthRevisionId:TARGET,
  });
  mocks.signed.mockResolvedValue({
    source:{body:{state:'issued'},proof:{payload:{},signature:'authentic-source-proof'}},
  });
  mocks.commit.mockResolvedValue({state:'committed'});
  mocks.reader.mockResolvedValue({state:'signed_pair_archive_reopened',readingId:READING});
  mocks.query.mockImplementation(async(sql:string,args:readonly unknown[])=>{
    if(sql.includes('cmd_claim_approved_saju_issue_job_v1'))
      return {rows:[job]};
    if(sql.includes('qry_approved_saju_issue_job_status_v1'))
      return {rows:[{attempt_no:existingAttempt,signed_commit:signedCommitted}]};
    if(sql.includes('prepare_approved_component_reading_v1'))
      return {rows:[{readingId:READING,sessionId:SESSION}]};
    if(sql.includes('cmd_prepare_approved_saju_attempt_v1'))
      return {rows:[{executionAttemptId:ATTEMPT,attemptState:'running',replayed:false}]};
    if(sql.includes('qry_approved_saju_pair_recovery_record_v1'))
      return {rows:[{readingId:READING,readerCharacterId:'seyeon'}]};
    if(sql.includes('cmd_complete_approved_saju_issue_job_v1'))
      return {rows:[{completed:true}]};
    throw new Error('Unexpected test query: '+sql+' '+String(args));
  });
});
afterEach(()=>vi.clearAllMocks());

describe('dedicated T10 purchased pair worker',()=>{
  it('allocates one attempt, checks signed source, commits and completes one lease',async()=>{
    const worker=createApprovedSajuT10PairIssuanceWorkerV1(config());
    expect(await worker.runNext()).toEqual({state:'issued'});
    expect(mocks.scope).toHaveBeenCalledTimes(1);
    expect(mocks.signed).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.commit.mock.calls[0]?.[0]).toMatchObject({
      subjectId:SUBJECT,purchaseIntentId:PURCHASE,readingId:READING,
      executionAttemptId:ATTEMPT,expectedReleaseRef:RELEASE,
    });
    expect(mocks.query.mock.calls.filter(args=>
      String(args[0]).includes('cmd_complete_approved_saju_issue_job_v1'))).toHaveLength(1);
  });

  it('does not call Source or allocate another attempt when a prior attempt exists',async()=>{
    existingAttempt=1;
    const worker=createApprovedSajuT10PairIssuanceWorkerV1(config());
    expect(await worker.runNext()).toEqual({
      state:'held',reason:'existing_attempt_reconciliation',jobId:JOB,
    });
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(args=>
      String(args[0]).includes('cmd_prepare_approved_saju_attempt_v1'))).toBe(false);
  });

  it('completes only a pre-existing attempt that has its signed DB receipt',async()=>{
    existingAttempt=1;signedCommitted=true;
    const worker=createApprovedSajuT10PairIssuanceWorkerV1(config());
    const once={...job,already_issued:true};
    mocks.query.mockImplementation(async(sql:string)=>{
      if(sql.includes('cmd_claim_approved_saju_issue_job_v1'))return {rows:[once]};
      if(sql.includes('qry_approved_saju_issue_job_status_v1'))
        return {rows:[{attempt_no:1,signed_commit:true}]};
      if(sql.includes('qry_approved_saju_pair_recovery_record_v1'))
        return {rows:[{readingId:READING,readerCharacterId:'seyeon'}]};
      if(sql.includes('cmd_complete_approved_saju_issue_job_v1'))return {rows:[{completed:true}]};
      throw Error('Unexpected query');
    });
    expect(await worker.runNext()).toEqual({state:'issued'});
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.reader).toHaveBeenCalledWith(expect.objectContaining({
      subjectId:SUBJECT,purchaseIntentId:PURCHASE,readingId:READING,
      readerCharacterId:'seyeon',
    }));
    expect(mocks.query.mock.calls.filter(args=>
      String(args[0]).includes('cmd_complete_approved_saju_issue_job_v1'))).toHaveLength(1);
  });

  it('holds a recovered attempt if its signed archive cannot be reopened',async()=>{
    mocks.reader.mockResolvedValue(null);
    mocks.query.mockImplementation(async(sql:string)=>{
      if(sql.includes('cmd_claim_approved_saju_issue_job_v1'))
        return {rows:[{...job,already_issued:true}]};
      if(sql.includes('qry_approved_saju_issue_job_status_v1'))
        return {rows:[{attempt_no:1,signed_commit:true}]};
      if(sql.includes('qry_approved_saju_pair_recovery_record_v1'))
        return {rows:[{readingId:READING,readerCharacterId:'seyeon'}]};
      throw Error('Recovery must not complete or issue without a valid archive');
    });
    expect(await createApprovedSajuT10PairIssuanceWorkerV1(config()).runNext()).toEqual({
      state:'held',reason:'archive_recovery_unverified',jobId:JOB,
    });
    expect(mocks.reader).toHaveBeenCalledOnce();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('holds an existing signed attempt when current consent or Reader mapping has changed',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>{
      if(sql.includes('cmd_claim_approved_saju_issue_job_v1'))
        return {rows:[{...job,already_issued:true}]};
      if(sql.includes('qry_approved_saju_issue_job_status_v1'))
        return {rows:[{attempt_no:1,signed_commit:true}]};
      if(sql.includes('qry_approved_saju_pair_recovery_record_v1'))
        return {rows:[]};
      throw Error('Invalid recovery must not change the outbox');
    });
    expect(await createApprovedSajuT10PairIssuanceWorkerV1(config()).runNext()).toEqual({
      state:'held',reason:'archive_recovery_unverified',jobId:JOB,
    });
    expect(mocks.reader).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('holds if committed claim has lost its signed proof',async()=>{
    mocks.query.mockImplementation(async(sql:string)=>{
      if(sql.includes('cmd_claim_approved_saju_issue_job_v1'))
        return {rows:[{...job,already_issued:true}]};
      if(sql.includes('qry_approved_saju_issue_job_status_v1'))
        return {rows:[{attempt_no:1,signed_commit:false}]};
      throw Error('Missing receipt must not be repaired by another dispatch');
    });
    expect(await createApprovedSajuT10PairIssuanceWorkerV1(config()).runNext()).toEqual({
      state:'held',reason:'missing_signed_receipt',jobId:JOB,
    });
    expect(mocks.reader).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
