// Watchtower-Track: character-memory
// Offline-only independently pinned Life Fact correction and supersession gold.
// This never writes an authoritative fact or decides a real user's identity.
import type {
 CharacterMemoryRetrievalResultV1,
} from './character-memory-retrieval-v1.js';

export const CHARACTER_MEMORY_CHANGED_FACT_EVAL_VERSION_V1 =
 'character-memory-changed-fact-offline-eval-v1' as const;

export type CharacterChangedFactGoldV1 = Readonly<{
 subjectId: string;
 characterId: string;
 sourceRef: string;
 factId: string;
 grantId: string;
 factType: string;
 /** Non-reversible fixture comparison label; no private value is returned. */
 valueDigest: string;
 sourceKind: 'user_explicit' | 'profile_edit' | 'merge_import';
 grantedAt: string;
 createdAt: string;
 confirmedAt: string;
 validFrom: string;
 validTo: string | null;
 revokedAt: string | null;
 /** Explicit independent supersession authority, NEVER inferred from prose. */
 supersedesSourceRef: string | null;
}>;

export type CharacterChangedFactOfflineInputV1 = Readonly<{
 scope: Readonly<{subjectId: string; characterId: string; threadId: string}>;
 /** Same canonical User turn as the separate source-fidelity evaluator. */
 asOf: string;
 /** Topics marked relevant by independent fixture authors, not the model. */
 queryFactTypes: readonly string[];
 sourceGold: readonly CharacterChangedFactGoldV1[];
 /** Actual read-only retrieval output; not an LLM claim. */
 retrieval: CharacterMemoryRetrievalResultV1;
}>;

export type CharacterChangedFactOfflineResultV1 = Readonly<{
 schemaVersion: typeof CHARACTER_MEMORY_CHANGED_FACT_EVAL_VERSION_V1;
 executionMode: 'offline_fixture_only';
 passed: boolean;
 scopePinned: boolean;
 independentTimelineValid: boolean;
 currentFactsUnambiguous: boolean;
 observedSelectionMatchesGold: boolean;
 expectedCurrentCount: number;
 observedRelevantCount: number;
 staleOrUnsupportedCount: number;
 /** Do not disclose fact contents, identifiers or private canonical turns. */
 productionMemoryWriteAllowed: false;
 modelSemanticRecallVerified: false;
}>;

function safe(value: unknown, max = 256): value is string {
 return typeof value === 'string' &&
  value.length > 0 && value.length <= max &&
  !/[\u0000-\u001f\u007f]/u.test(value);
}
function time(value: unknown): number | null {
 if(typeof value !== 'string' || value.length < 20 || value.length > 35 ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value))
  return null;
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) ? parsed : null;
}
function truthResult(
 input: CharacterChangedFactOfflineInputV1,
 args: {scopePinned: boolean; independentTimelineValid: boolean;
  currentFactsUnambiguous: boolean; observedSelectionMatchesGold: boolean;
  expectedCurrentCount: number; observedRelevantCount: number;
  staleOrUnsupportedCount: number},
): CharacterChangedFactOfflineResultV1 {
 void input;
 return Object.freeze({
  schemaVersion: CHARACTER_MEMORY_CHANGED_FACT_EVAL_VERSION_V1,
  executionMode: 'offline_fixture_only' as const,
  passed: args.scopePinned && args.independentTimelineValid &&
   args.currentFactsUnambiguous && args.observedSelectionMatchesGold,
  ...args,
  productionMemoryWriteAllowed: false as const,
  modelSemanticRecallVerified: false as const,
 });
}

/**
 * Reconcile source-owned temporal truth with an already-selected retrieval.
 * It does NOT infer factual equality/contradiction or supersession from text.
 * Without independently pinned source-gold links, report a HOLD (failed).
 */
export function evaluateCharacterChangedFactOfflineV1(
 input: CharacterChangedFactOfflineInputV1,
): CharacterChangedFactOfflineResultV1 {
 if(!input || !safe(input.scope?.subjectId) ||
    !safe(input.scope?.characterId,128) ||
    !safe(input.scope?.threadId) || time(input.asOf)===null ||
    !Array.isArray(input.queryFactTypes) ||
    input.queryFactTypes.length>32 ||
    input.queryFactTypes.some(t=>!safe(t,128)) ||
    new Set(input.queryFactTypes).size!==input.queryFactTypes.length ||
    !Array.isArray(input.sourceGold) || input.sourceGold.length>128 ||
    !Array.isArray(input.retrieval?.records)) {
  throw new TypeError('Changed-fact offline evaluation requires bounded independent source gold.');
 }
 const scopePinned =
  input.scope.subjectId===input.retrieval.scope?.subjectId &&
  input.scope.characterId===input.retrieval.scope?.characterId &&
  input.scope.threadId===input.retrieval.scope?.threadId &&
  // The temporal judgment must be pinned to the exact canonical turn read
  // by retrieval, not a later independently invented evaluation instant.
  input.asOf===input.retrieval.querySourceTurn?.createdAt &&
  safe(input.retrieval.querySourceTurn?.messageId) &&
  Number.isSafeInteger(input.retrieval.querySourceTurn?.sequenceNo) &&
  input.retrieval.querySourceTurn.sequenceNo>0;
 const asOf = time(input.asOf)!;
 const byRef = new Map<string, CharacterChangedFactGoldV1>();
 let valid = true;
 for(const fact of input.sourceGold) {
  if(!fact || !safe(fact.factId) || !safe(fact.grantId) ||
     !safe(fact.factType,128) ||
     !/^[a-f0-9]{16,128}$/u.test(fact.valueDigest ?? '') ||
     !['user_explicit','profile_edit','merge_import'].includes(fact.sourceKind) ||
     fact.subjectId!==input.scope.subjectId ||
     fact.characterId!==input.scope.characterId ||
     fact.sourceRef!=='life_fact:'+fact.factId+':grant:'+fact.grantId ||
     byRef.has(fact.sourceRef) ||
     !safe(fact.sourceRef) ||
     time(fact.grantedAt)===null || time(fact.createdAt)===null ||
     time(fact.confirmedAt)===null || time(fact.validFrom)===null ||
     (fact.validTo!==null && time(fact.validTo)===null) ||
     (fact.revokedAt!==null && time(fact.revokedAt)===null) ||
     (fact.supersedesSourceRef!==null && !safe(fact.supersedesSourceRef)) ||
     time(fact.createdAt)!>time(fact.confirmedAt)! ||
     time(fact.createdAt)!>time(fact.grantedAt)! ||
     (fact.validTo!==null && time(fact.validFrom)!>time(fact.validTo)!) ||
     (fact.revokedAt!==null &&
      (time(fact.revokedAt)!<time(fact.createdAt)! ||
       time(fact.revokedAt)!<time(fact.grantedAt)!))) {
   valid=false;
   continue;
  }
  byRef.set(fact.sourceRef,fact);
 }
 if(byRef.size!==input.sourceGold.length)valid=false;

 // An independent source-of-truth transition is admissible only if every
 // predecessor is identified, has the SAME scope and fact topic, and has
 // ceased being current before its successor becomes valid.
 for(const fact of byRef.values()){
  if(fact.supersedesSourceRef===null)continue;
  const prior=byRef.get(fact.supersedesSourceRef);
  if(!prior || prior.sourceRef===fact.sourceRef ||
     prior.factType!==fact.factType ||
     prior.validTo===null ||
     time(prior.validTo)!>=time(fact.validFrom)! ||
     time(prior.confirmedAt)!>=time(fact.confirmedAt)!){
   valid=false;
  }
 }
 const currentByType = new Map<string, string[]>();
 const relevant = new Set(input.queryFactTypes);
 for(const fact of byRef.values()){
  if(!relevant.has(fact.factType))continue;
  const available = time(fact.createdAt)!<=asOf &&
   time(fact.grantedAt)!<=asOf &&
   time(fact.confirmedAt)!<=asOf &&
   time(fact.validFrom)!<=asOf &&
   (fact.validTo===null || time(fact.validTo)!>=asOf) &&
   (fact.revokedAt===null || time(fact.revokedAt)!>asOf);
  if(!available)continue;
  const current=currentByType.get(fact.factType)??[];
  current.push(fact.sourceRef);
  currentByType.set(fact.factType,current);
 }
 // One current source for each relevant topic; competing assertions fail
 // rather than choosing the most recent text or claiming a settled fact.
 const currentFactsUnambiguous=
  [...currentByType.values()].every(current=>current.length===1);
 const expected=new Set([...currentByType.values()].flat());
 const observed=input.retrieval.records.filter(r=>r.record.recordKind==='life_fact');
 const observedRefs=observed.map(r=>r.record.sourceRef);
 const observedRelevantCount=observed.length;
 const observedSet=new Set(observedRefs);
 const staleOrUnsupportedCount=observedRefs.filter(ref=>!expected.has(ref)).length;
 const observedSelectionMatchesGold=valid && scopePinned &&
  currentFactsUnambiguous &&
  observedRefs.length===observedSet.size &&
  expected.size===observedSet.size &&
  [...expected].every(ref=>observedSet.has(ref)) &&
  observed.every(({record})=>{
   const gold=byRef.get(record.sourceRef);
   return gold!==undefined &&
    gold.factId===record.recordId &&
    gold.grantId===record.grantId &&
    gold.factType===record.recordType &&
    // Original source provenance and Character grant are immutable.
    record.granteeCharacterId===gold.characterId &&
    record.sourceKind===gold.sourceKind &&
    record.claimKind==='fact' &&
    gold.validFrom===record.validFrom &&
    gold.validTo===record.validTo &&
    gold.createdAt===record.createdAt &&
    gold.confirmedAt===record.confirmedAt &&
    gold.grantedAt===record.grantedAt;
  });
 return truthResult(input,{
  scopePinned,independentTimelineValid:valid,
  currentFactsUnambiguous,observedSelectionMatchesGold,
  expectedCurrentCount:expected.size,observedRelevantCount,
  staleOrUnsupportedCount,
 });
}
