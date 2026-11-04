import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertSeyeonG0HistoricalMessagesRequireOwnerDbPinV1,
  SEYEON_G0_VERIFIED_HISTORY_PRECOMMIT_V1,
} from '../apps/api/src/seyeon-g0-verified-history-precommit-v1.js';
import {
  assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1,
  SeyeonPersonalRecordPrecommitHoldV1,
} from '../apps/api/src/seyeon-personal-record-precommit-hold-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type { SeyeonProductionContextSnapshotV1 } from '../apps/api/src/seyeon-production-context-v1.js';

const priorUser={messageId:'10000000-0000-4000-8000-000000000001',role:'user' as const,text:'hello'};
const priorAssistant={messageId:'10000000-0000-4000-8000-000000000002',role:'assistant' as const,text:'hello again'};
const currentUser={messageId:'10000000-0000-4000-8000-000000000003',role:'user' as const,text:'continue'};
const history=[priorUser,priorAssistant];
const recent=[...history,currentUser];

const context = (overrides: Record<string,unknown>={}) => ({
  version:'seyeon-production-context-v1',
  relationshipRevisionUsedForTurn:0,
  historyThroughRevision:0,
  recentMessages:history,
  retrievedMemories:[],
  personalRecordAdmissions:[],
  personalRecordProjectionCandidates:[],
  activeRelationshipEventCount:0,
  relationshipHistoryRecords:[],
  ...overrides,
}) as unknown as SeyeonProductionContextSnapshotV1;

const selection = (messages=recent) => selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories:[],
  sourceCandidates:[],
  recentMessages:messages,
  currentUserMessageId:currentUser.messageId,
});

const invoke=(overrides: Record<string,unknown>={})=>
  assertSeyeonG0HistoricalMessagesRequireOwnerDbPinV1({
    productionContext:context(),
    selectedModelSources:selection(),
    modelRecentMessages:recent,
    currentUserMessageId:currentUser.messageId,
    ...overrides,
  });

describe('G0 follow-up: original-history source remains DB-authority-gated',()=>{
  it('accepts a bounded owner-read historical User/Assistant candidate, never authorizing a provider',()=>{
    const marker=invoke();
    expect(marker).toBe(SEYEON_G0_VERIFIED_HISTORY_PRECOMMIT_V1);
    expect(marker).toEqual({
      version:'seyeon-g0-verified-history-precommit-v1',
      permitsProviderBeforeOwnerDbPin:false,
      permitsPositivePersonalRecords:false,
      permitsHttpReveal:false,
    });
    expect(Object.isFrozen(marker)).toBe(true);
    // The old zero-history guard remains fail-closed, not relaxed globally.
    expect(()=>assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(context()))
      .toThrow(SeyeonPersonalRecordPrecommitHoldV1);
  });

  it('cannot drop, replace, invent or reorder any model-selected original historical message',()=>{
    for (const invalid of [
      {modelRecentMessages:[priorUser,currentUser]},
      {modelRecentMessages:[priorAssistant,priorUser,currentUser]},
      {modelRecentMessages:[{...priorUser,text:'FORGED'},priorAssistant,currentUser]},
      {modelRecentMessages:[priorUser,{...priorAssistant,messageId:priorUser.messageId},currentUser]},
      {modelRecentMessages:[priorUser,priorAssistant,{...currentUser,text:'FORGED'}]},
      {currentUserMessageId:priorUser.messageId},
      {productionContext:context({recentMessages:[{...priorUser,text:'FORGED'},priorAssistant]})},
      {selectedModelSources:{...selection(),selectedModelSourceCensusDigest:'sha256:v1:'+'0'.repeat(64)}},
      {selectedModelSources:{...selection(),selectedUnpinnedRecentSources:[]}},
      {selectedModelSources:{...selection(),selectedCurrentUserSource:null}},
      {selectedModelSources:{...selection(),selectedSources:[{recordKind:'memory'}]}},
    ]) {
      expect(()=>invoke(invalid)).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
  });

  it('rejects relationship-derived, remembered or unknown sources even when historical chat looks valid',()=>{
    for (const changed of [
      {retrievedMemories:[{kind:'relationship_event'}]},
      {retrievedMemories:[{kind:'memory'}]},
      {personalRecordAdmissions:[{reason:'ADMITTED'}]},
      {personalRecordAdmissions:[null]},
      {personalRecordProjectionCandidates:[{recordId:'unverified'}]},
      {relationshipHistoryRecords:[{eventId:'old-event'}]},
      {activeRelationshipEventCount:1},
      {historyThroughRevision:1,relationshipRevisionUsedForTurn:1},
      {historyThroughRevision:1},
      {relationshipRevisionUsedForTurn:1},
      {recentMessages:[]},
      {recentMessages:null},
    ]) {
      expect(()=>invoke({productionContext:context(changed)}))
        .toThrow(SeyeonPersonalRecordPrecommitHoldV1);
    }
    expect(()=>invoke({selectedModelSources:{
      ...selection(),selectedUnpinnedDerivedSources:[{kind:'relationship_event'}],
    }})).toThrow(SeyeonPersonalRecordPrecommitHoldV1);
  });

  it('requires original-DB pinned context before Preflight or any AI call and retains strict no-history protection',()=>{
    const runtime=readFileSync(new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts',import.meta.url),'utf8');
    const selector=runtime.indexOf('const exactModelPersonalSources = selectSeyeonExactModelPersonalSourcesV1(');
    const historical=runtime.indexOf('assertSeyeonG0HistoricalMessagesRequireOwnerDbPinV1(');
    const empty=runtime.indexOf('assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(');
    const mark=runtime.indexOf('await input.persistencePort.markContextReady({');
    const preflight=runtime.indexOf('const governance = await resolveTurnGovernance({');
    const provider=runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(selector).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(selector);
    expect(historical).toBeGreaterThan(empty);
    expect(mark).toBeGreaterThan(historical);
    expect(preflight).toBeGreaterThan(mark);
    expect(provider).toBeGreaterThan(preflight);
    const db=readFileSync(new URL('../apps/api/src/postgres-seyeon-production-chat-execution-v1.ts',import.meta.url),'utf8');
    expect(db).toContain('cmd_mark_seyeon_chat_context_ready_pinned_v1');
    expect(db).toContain('exactModelSourceSelection: input.exactModelSourceSelection');
    expect(db).toContain('zeroProof: input.zeroPersonalProof');
  });
});
