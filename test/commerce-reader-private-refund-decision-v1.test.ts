import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordOwnerApprovedReaderFullRefundDecisionV1 as record,
  READER_REFUND_DECISION_PRIVATE_V1 as policy,
} from '../apps/api/src/commerce-reader-private-refund-decision-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';

const authId='11111111-1111-4111-8111-111111111111';
const receiptId='22222222-2222-4222-8222-222222222222';
const claimId='44444444-4444-4444-8444-444444444444';
const claimFingerprint='sha256:v1:'+createHash('sha256').update(claimId).digest('hex');
const operatorRef='operator:33333333-3333-4333-8333-333333333333';
const decisionRef='sha256:v1:'+'a'.repeat(64);
const approvedAt='2026-11-01T08:00:00.000Z';
const input={
  authorizationId:authId,receiptId,operatorRef,decisionRef,
  approvedAt,reasonCode:'customer_withdrawal' as const,
};
function fixture(options:{
  privileged?:boolean;
  readonly?:boolean;
  existing?:boolean;
  conflicting?:boolean;
  noPurchase?:boolean;
  commitUnknown?:boolean;
  linked?:boolean;
}={}){
  const queries:{sql:string;args:unknown[]|undefined}[]=[];
  const release=vi.fn();
  const pool:PostgresSubjectPoolV1={
    connect:vi.fn(async()=>({
      query:vi.fn(async<Row=Record<string,unknown>>(sql:string,args?:unknown[])=>{
        queries.push({sql,args});
        if(sql.startsWith('BEGIN')||sql==='ROLLBACK')
          return {rows:[] as Row[]};
        if(sql==='COMMIT'){
          if(options.commitUnknown)throw Error('lost reply');
          return {rows:[] as Row[]};
        }
        if(sql.includes('rolsuper or rolbypassrls'))
          return {rows:[{fullVisibility:options.privileged!==false,
            readOnly:options.readonly===true}] as Row[]};
        const saved={
          id:authId,receiptId,operatorRef,decisionRef,
          approvedAt:new Date(approvedAt),
          reasonCode:'customer_withdrawal',status:'approved',
          claimSourceFingerprint:options.linked?claimFingerprint:null,
        };
        if(sql.startsWith('insert into public.commerce_reader_full_refund_dispatches_v1'))
          return {rows:options.noPurchase||options.existing?[] as Row[]:[saved as Row]};
        if(sql.includes('where receipt_id=$1::uuid limit 2'))
          return {rows:[{...saved,...(options.conflicting?{
            decisionRef:'sha256:v1:'+'b'.repeat(64),
          }: {})} as Row]};
        throw Error('Unexpected SQL');
      }),
      release,
    })),
  };
  return {pool,queries,release};
}
describe('operator-adjudicated private Reader refund intake',()=>{
  it('does not mount public refund or create an automatic legal decision',()=>{
    expect(policy).toMatchObject({publicRouteMounted:false,
      automaticLegalAdjudication:false,financialEvidenceRetention:'P5Y'});
  });
  it('records one exact manually reviewed Receipt using a privileged transaction',async()=>{
    const f=fixture();
    expect(await record({...input,pool:f.pool})).toEqual({
      kind:'recorded',authorizationId:authId,
    });
    expect(f.queries[0]?.sql).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
    const sql=f.queries.find(q=>q.sql.startsWith('insert into'))!;
    expect(sql.sql).toContain("cr.verification_status='verified'");
    expect(sql.sql).toContain("pi.status='verified'");
    expect(sql.sql).toContain('purchase_intent_reader_selections');
    expect(sql.sql).toContain("on conflict (receipt_id) do nothing");
    expect(sql.args).toEqual([authId,receiptId,decisionRef,operatorRef,
      approvedAt,'customer_withdrawal',null]);
    expect(f.queries.at(-1)?.sql).toBe('COMMIT');
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it('links an existing exact customer claim under the same Receipt, without saving raw claim ID',async()=>{
    const f=fixture({linked:true});
    const result=await record({...input,pool:f.pool,sourceClaimId:claimId});
    expect(result.kind).toBe('recorded');
    const written=f.queries.find(q=>q.sql.startsWith('insert into'))!;
    expect(written.args?.[6]).toBe(claimId);
    expect(written.sql).toContain('c.subject_id=cr.subject_id');
    expect(written.sql).toContain('c.purchase_intent_id=pi.id');
    expect(written.sql).toContain('pres.unit_id=c.unit_id');
    expect(written.sql).toContain('source_claim_fingerprint');
    expect(written.sql).toContain('pg_catalog.sha256');
    expect(f.queries.at(-1)?.sql).toBe('COMMIT');
  });
  it('prevents conflicting source claim on an existing refund authorization',async()=>{
    const f=fixture({linked:false,existing:true});
    await expect(record({...input,pool:f.pool,sourceClaimId:claimId}))
      .rejects.toThrow('READER_REFUND_OWNER_DECISION_REPLAY_CONFLICT');
    expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('rejects invalid source claim reference before touching DB',async()=>{
    const f=fixture();
    await expect(record({...input,pool:f.pool,sourceClaimId:'other-account'}))
      .rejects.toThrow('READER_REFUND_OWNER_DECISION_INVALID');
    expect(f.queries).toHaveLength(0);
  });
  it('same decision replays exactly, never changes the original approval',async()=>{
    const f=fixture({existing:true});
    expect(await record({...input,pool:f.pool})).toMatchObject({kind:'existing'});
    expect(f.queries.at(-1)?.sql).toBe('COMMIT');
  });
  it('rejects a conflicting decision on the same Receipt and rolls back',async()=>{
    const f=fixture({existing:true,conflicting:true});
    await expect(record({...input,pool:f.pool})).rejects.toThrow(
      'READER_REFUND_OWNER_DECISION_REPLAY_CONFLICT');
    expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('rejects missing real verified paid Reader purchase',async()=>{
    const f=fixture({noPurchase:true});
    const adjusted={...f, pool:f.pool};
    // Without an owner-stored decision to replay, no new authorization is minted.
    const pool:PostgresSubjectPoolV1={connect:async()=>({
      query:async<Row=Record<string,unknown>>(sql:string)=>{
        if(sql.includes('rolsuper or rolbypassrls'))
          return {rows:[{fullVisibility:true,readOnly:false} as Row]};
        return {rows:[] as Row[]};
      },
      release:()=>{},
    })};
    await expect(record({...input,pool})).rejects.toThrow(
      'READER_REFUND_DECISION_UNAVAILABLE');
    expect(adjusted.queries).toHaveLength(0);
  });
  it.each([{privileged:false},{readonly:true}])(
    'denies any executor without writable full financial-evidence visibility',async(opts)=>{
      const f=fixture(opts);
      await expect(record({...input,pool:f.pool})).rejects.toThrow(
        'READER_REFUND_PRIVILEGED_OWNER_REQUIRED');
      expect(f.queries.some(q=>q.sql.startsWith('insert into'))).toBe(false);
      expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');
    });
  it('never claims failure or success after an ambiguous COMMIT',async()=>{
    const f=fixture({commitUnknown:true});
    expect(await record({...input,pool:f.pool})).toEqual({kind:'unknown_commit'});
    expect(f.queries.some(q=>q.sql==='COMMIT')).toBe(true);
  });
  it.each([
    {operatorRef:'Jane Doe'},
    {decisionRef:'Legal approved, refund okay'},
    {approvedAt:'2026-11-01'},
    {reasonCode:'internal_AI_generated'},
    {receiptId:'other-customer'},
  ])('rejects untrusted legal identity input before DB access: %j',async(patch)=>{
    const f=fixture();
    await expect(record({...input,...patch,pool:f.pool} as Parameters<typeof record>[0]))
      .rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it('immutable legal actor/decision; P5Y minimum and manual-only data ACL',()=>{
    const sql=readFileSync(new URL(
      '../supabase/migrations/2310_official_reader_private_refund_dispatch_v1.sql',
      import.meta.url),'utf8');
    expect(sql).toContain('retained_until timestamptz not null');
    expect(sql).toContain("interval '5 years'");
    expect(sql).toContain("legal_decision_ref ~ '^sha256:v1:");
    expect(sql).toContain("legal_actor_ref ~ '^operator:");
    expect(sql).toContain("new.retained_until < old.retained_until");
    expect(sql).toContain("old.status <> 'confirmed'");
    expect(sql).toContain('create trigger tr_guard_reader_full_refund_dispatch_v1');
    expect(sql).toContain("pe.external_event_id=('myeongha:portone-v2:full-cancel:v1:'||p_cancellation_id)");
    expect(sql).toContain('legal_approved_at <= created_at');
    expect(sql).toContain('legal_decision_ref text not null unique');
    expect(sql).toContain('source_claim_fingerprint text');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on public.commerce_reader_full_refund_dispatches_v1 from public');
    expect(sql).not.toContain('grant insert on');
  });
});
