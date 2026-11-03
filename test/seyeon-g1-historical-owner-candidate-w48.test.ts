// Watchtower-Track: security
// W48: isolated historical G1 DB owner candidate never admits model/Commit/Reveal.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonicalJson} from '../packages/domain/src/index.js';
import {describe,expect,it} from 'vitest';
import {
  createSeyeonG1HistoricalCandidateOwnerPortV1,
  type SeyeonG1HistoricalCandidatePinInputV1,
} from '../apps/api/src/postgres-seyeon-g1-historical-candidate-port-v1.js';
import type {
  PostgresQueryResultV1,PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sha=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const wire=(v:string)=>'sha256:wire-utf8:v1:'+
  createHash('sha256').update(v,'utf8').digest('hex');
const pg='sha256:pg-jsonb:v1:'+'e'.repeat(64);
const original={
  recordKind:'memory' as const,recordId:id(6),grantId:id(7),
  recordType:'conversation_recall',schemaVersion:'v1',
  rawRecordDigest:sha({fixture:'synthetic'}),
  projectedMemoryDigest:sha({memory:'synthetic'}),
  rawRecordPgDigest:pg,
  projectorVersion:'seyeon-conversation-recall-projector-v1',
};
const historicalSources=[
  {messageId:id(8),role:'user' as const,textDigest:wire('original User')},
  {messageId:id(9),role:'assistant' as const,textDigest:wire('original Assistant')},
];
const input:SeyeonG1HistoricalCandidatePinInputV1={
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  currentUserMessageId:id(5),currentUserTextDigest:wire('current User'),
  selectedOriginalMemory:original,selectedSourcesDigest:sha([original]),
  preModelContextDigest:sha({fixture:'full pre-model Context'}),
  historicalSources,
};
const proof=()=>({
  schemaVersion:'seyeon-g1-historical-source-candidate-v1',
  subjectId:input.subjectId,threadId:input.threadId,turnId:input.turnId,
  attemptId:input.attemptId,characterId:'seyeon',
  currentUserMessageId:input.currentUserMessageId,
  currentUserTextDigest:input.currentUserTextDigest,
  recordKind:'memory',recordId:original.recordId,
  originalGrantId:original.grantId,
  originalGrantedAt:'2026-11-01T00:00:00Z',
  recordType:original.recordType,recordSchemaVersion:original.schemaVersion,
  projectorVersion:original.projectorVersion,
  originalPgJsonbDigest:original.rawRecordPgDigest,
  selectedSourcesDigest:input.selectedSourcesDigest,
  projectedMemoryDigest:original.projectedMemoryDigest,
  preModelContextDigest:input.preModelContextDigest,
  historicalSourceCount:2,historicalSources,
  historicalSourceCensusDigest:'sha256:pg-jsonb:v1:'+'a'.repeat(64),
  authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
});
const fake=(receipt:unknown)=>{
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(
      sql:string,params:readonly unknown[]=[],
    ):Promise<PostgresQueryResultV1<Row>>{
      calls.push({sql,params});
      return {rows:[{receipt} as unknown as Row]};
    },
  };
  return {port:createSeyeonG1HistoricalCandidateOwnerPortV1(client),calls};
};
describe('W48 DB-owned historical G1 candidate (HOLD)',()=>{
  it('validates a complete DB receipt and keeps every authority flag FALSE',async()=>{
    const {port,calls}=fake(proof());
    const response=await port.pinBeforeModel(input);
    expect(response).toEqual(proof());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('cmd_pin_seyeon_historical_source_candidate_s0_v1');
    expect(calls[0]?.params).toHaveLength(16);
    expect(calls[0]?.params[15]).toEqual(JSON.stringify(historicalSources));
    expect(response.authorizesModel).toBe(false);
    expect(response.permitsAtomicCommit).toBe(false);
    expect(response.permitsHttpReveal).toBe(false);
  });
  it.each([
    ['model permission',{authorizesModel:true}],
    ['Commit permission',{permitsAtomicCommit:true}],
    ['Reveal permission',{permitsHttpReveal:true}],
    ['forged old Grant',{originalGrantId:id(10)}],
    ['changed original User',{currentUserTextDigest:wire('forged')}],
    ['source count mismatch',{historicalSourceCount:1}],
    ['missing historical source',{historicalSources:[historicalSources[0]]}],
    ['different source type',{schemaVersion:'seyeon-positive-original-memory-source-pin-v1'}],
    ['extra authority',{untrustedApproval:true}],
  ] as const)('rejects %s even when DB returns a receipt',async(_name,patch)=>{
    const {port,calls}=fake({...proof(),...patch});
    await expect(port.pinBeforeModel(input)).rejects.toThrow('receipt mismatch');
    expect(calls).toHaveLength(1);
  });
  it.each([
    ['invalid raw digest',{...input,selectedOriginalMemory:{...original,rawRecordPgDigest:'fake'}}],
    ['swapped original Grant',{...input,selectedOriginalMemory:{...original,grantId:id(10)}}],
    ['duplicated historical message',{...input,historicalSources:[historicalSources[0]!,historicalSources[0]!]}],
    ['current User reinserted',{...input,historicalSources:[{...historicalSources[0]!,messageId:id(5)}]}],
    ['unknown source role',{...input,historicalSources:[{...historicalSources[0]!,role:'system'}]}],
  ] as const)('holds %s before executing the owner function',async(_name,forged)=>{
    const {port,calls}=fake(proof());
    await expect(port.pinBeforeModel(
      forged as SeyeonG1HistoricalCandidatePinInputV1
    )).rejects.toThrow('original source unverifiable');
    expect(calls).toHaveLength(0);
  });
  it('DB rechecks entire G0 original lineage and stores distinct, non-publishable candidate proof',()=>{
    const sql=readFileSync(new URL(
      '../scripts/operations/seyeon-security-s0/22-g1-original-historical-candidate-pin.sql',
      import.meta.url,
    ),'utf8');
    expect(sql).toContain('qry_seyeon_g0_current_source_recent_messages_v1(');
    expect(sql).toContain('v_history is distinct from p_expected_historical');
    expect(sql).toContain('lock_original_memory_grant_v1(');
    expect(sql).toContain("'historicalCandidateProof',v_proof");
    expect(sql).toContain("'authorizesModel',false");
    expect(sql).toContain("'permitsAtomicCommit',false");
    expect(sql).toContain("'permitsHttpReveal',false");
    expect(sql).toContain('lock_memory_source_message_v1(');
    expect(sql).toContain('m.body_text=v_row.body_text');
    const g2=readFileSync(new URL('../scripts/operations/seyeon-security-s0/02-atomic-commit.sql',import.meta.url),'utf8');
    expect(g2).toContain("old.seyeon_personal_source_pin_jsonb -> 'positiveProof'");
    expect(g2).toContain("a.seyeon_personal_source_pin_jsonb -> 'positiveProof'");
  });
  it('preserves a committed candidate HOLD without retryable failure cleanup',()=>{
    const server=readFileSync(new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts',import.meta.url),'utf8');
    const persist=server.indexOf('await input.historicalSourceCandidateDbPort.pinBeforeModel({');
    const hold=server.indexOf('throw new SeyeonHistoricalCandidatePersistedHoldV1();',persist);
    const provider=server.indexOf('const runtime = await runSeyeonCharacterTurnV2({',persist);
    const failure=server.indexOf('await input.persistencePort.failAttempt({',provider);
    expect(persist).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(persist);
    expect(provider).toBeGreaterThan(hold);
    expect(failure).toBeGreaterThan(provider);
    expect(server.slice(failure-160,failure)).toContain('!(error instanceof SeyeonHistoricalCandidatePersistedHoldV1)');
    expect(server).toContain("readonly code = 'SEYEON_HISTORICAL_CANDIDATE_HOLD'");
  });
  it('production execution always stops before model after isolated DB candidate Pin',()=>{
    const server=readFileSync(new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts',import.meta.url),'utf8');
    const pin=server.indexOf('await input.historicalSourceCandidateDbPort.pinBeforeModel({');
    const denied=server.indexOf('throw new SeyeonHistoricalCandidatePersistedHoldV1();',pin);
    const run=server.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(pin).toBeGreaterThan(0);
    expect(denied).toBeGreaterThan(pin);
    expect(run).toBeGreaterThan(denied);
  });
});
