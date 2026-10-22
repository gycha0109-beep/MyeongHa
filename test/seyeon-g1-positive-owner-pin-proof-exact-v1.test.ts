// Watchtower-Track: security
// Positive G1 SQL owner receipt shape: synthetic-only, no production deployment.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../packages/domain/src/index.js';
import {describe, expect, it} from 'vitest';
import {
  createSeyeonPositiveS0OwnerDbPortsV1,
  type SeyeonPositiveS0SourcePinInputV1,
} from '../apps/api/src/postgres-seyeon-positive-memory-source-runtime-v1.js';
import type {
  PostgresQueryResultV1, PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const UUID=(n:number)=>`d${n}000000-0000-4000-8000-000000000001`;
const DIGEST=(value:string)=>'sha256:v1:'+value.repeat(64);
const PG_DIGEST='sha256:pg-jsonb:v1:'+'e'.repeat(64);
const selectedSources=[Object.freeze({
  recordKind:'memory' as const,
  recordId:UUID(5),grantId:UUID(6),
  recordType:'shared_detail',schemaVersion:'memory-v1',
  rawRecordDigest:DIGEST('d'),projectedMemoryDigest:DIGEST('b'),
  rawRecordPgDigest:PG_DIGEST,projectorVersion:'seyeon-memory-projector-v1',
})];
function selectedDigest(source:unknown):string{
  return 'sha256:v1:'+createHash('sha256').update(canonicalJson(source)).digest('hex');
}

const input:SeyeonPositiveS0SourcePinInputV1={
  subjectId:UUID(1),
  threadId:UUID(2),
  turnId:UUID(3),
  attemptId:UUID(4),
  originalMemoryId:UUID(5),
  originalGrantId:UUID(6),
  recordType:'shared_detail',
  schemaVersion:'memory-v1',
  projectorVersion:'seyeon-memory-projector-v1',
  selectedSources,
  selectedSourcesDigest:selectedDigest(selectedSources),
  projectedMemoryDigest:DIGEST('b'),
  finalModelContextDigest:DIGEST('c'),
  expectedOriginalPgDigest:PG_DIGEST,
};

function actualDbProof():Record<string,unknown>{
  return {
    schemaVersion:'seyeon-positive-original-memory-source-pin-v1',
    subjectId:input.subjectId,
    threadId:input.threadId,
    turnId:input.turnId,
    attemptId:input.attemptId,
    characterId:'seyeon',
    recordKind:'memory',
    recordId:input.originalMemoryId,
    originalGrantId:input.originalGrantId,
    originalGrantedAt:'2026-10-22T10:00:00+00:00',
    recordType:input.recordType,
    recordSchemaVersion:input.schemaVersion,
    projectorVersion:input.projectorVersion,
    selectedSourcesDigest:input.selectedSourcesDigest,
    projectedMemoryDigest:input.projectedMemoryDigest,
    originalPgJsonbDigest:input.expectedOriginalPgDigest,
    finalModelContextDigest:input.finalModelContextDigest,
  };
}

function fakeOwner(proof:unknown) {
  const sql:string[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(text:string,_args:readonly unknown[]=[]):Promise<PostgresQueryResultV1<Row>>{
      sql.push(text);
      return {rows:[{receipt:proof} as unknown as Row]};
    },
  };
  return {port:createSeyeonPositiveS0OwnerDbPortsV1(client),sql};
}

describe('S3/G1 exact DB owner original Memory Pin receipt',()=>{
  it('accepts only the original G1 SQL proof schema with full model-source bindings',async()=>{
    const proof=actualDbProof();
    const {port,sql}=fakeOwner(proof);
    await expect(port.pinBeforeModel(input)).resolves.toEqual(proof);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('cmd_mark_seyeon_positive_context_ready_pinned_v1');
  });

  it.each([
    ['another Character',{characterId:'other'}],
    ['other record kind',{recordKind:'life_fact'}],
    ['different record type',{recordType:'private'}],
    ['different original schema',{recordSchemaVersion:'memory-v2'}],
    ['different projector contract',{projectorVersion:'other-v2'}],
    ['missing original grant timestamp',{originalGrantedAt:undefined}],
    ['non-date original grant timestamp',{originalGrantedAt:'not-a-date'}],
    ['untrusted extra authority',{newSourceAuthority:'unexpected'}],
    ['mismatched original source digest',{originalPgJsonbDigest:PG_DIGEST.replace('e','f')}],
    ['replaced original Grant',{originalGrantId:UUID(7)}],
  ] as const)('rejects %s in the DB G1 proof rather than accepting model authorization',async(_name,patch)=>{
    const {port,sql}=fakeOwner({...actualDbProof(),...patch});
    await expect(port.pinBeforeModel(input)).rejects.toThrow(/Pin receipt mismatch/u);
    expect(sql).toHaveLength(1);
  });

  it.each([
    ['syntax-valid but unrelated selection digest',()=>({...input,selectedSourcesDigest:DIGEST('a')})],
    ['changed original grant with recomputed selection hash',()=>{
      const sources=[{...selectedSources[0]!,grantId:UUID(7)}];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
    ['changed projected source text hash with recomputed selection hash',()=>{
      const sources=[{...selectedSources[0]!,projectedMemoryDigest:DIGEST('f')}];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
    ['unapproved added SourceSet field and recomputed hash',()=>{
      const sources=[{...selectedSources[0]!,untrustedAuthority:'provider'}];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
    ['unregistered second source with recomputed full digest',()=>{
      const sources=[selectedSources[0]!,{...selectedSources[0]!,recordId:UUID(7)}];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
    ['missing original raw JSONB digest with recomputed hash',()=>{
      const {rawRecordPgDigest: _excluded, ...withoutPgDigest}=selectedSources[0]!;
      const sources=[withoutPgDigest];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
    ['forged different projector with recomputed selection hash',()=>{
      const sources=[{...selectedSources[0]!,projectorVersion:'other-projector'}];
      return {...input,selectedSources:sources,selectedSourcesDigest:selectedDigest(sources)};
    }],
  ] as const)('denies %s before opening original G1 DB owner RPC',async(_name,make)=>{
    const {port,sql}=fakeOwner(actualDbProof());
    await expect(port.pinBeforeModel(make())).rejects.toThrow(/G1 selected source digest mismatch/u);
    expect(sql).toHaveLength(0);
  });

  it('rejects truncated object proof without inferring absent authority',async()=>{
    const proof=actualDbProof();
    delete proof.recordKind;
    const {port}=fakeOwner(proof);
    await expect(port.pinBeforeModel(input)).rejects.toThrow(/Pin receipt mismatch/u);
  });
});
