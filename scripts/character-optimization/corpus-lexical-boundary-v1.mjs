/** Synthetic-only local lexical cross-split screen.
 * This never exports text, normalized text or a content fingerprint. The
 * screen cannot establish semantic independence or authorize optimizer input.
 */
import { CHARACTER_IDS } from './contracts-v1.mjs';

const fail = code => { throw new Error('CHARACTER_LEXICAL_SPLIT_INVALID:' + code); };
const key = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}(?![\s\S])/u.test(v);
const normalize = v => v.normalize('NFKC').toLocaleLowerCase('ko-KR')
  .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]/gu, '').trim();
const grams = v => new Set(Array.from({ length: Math.max(0, v.length - 1) },
  (_, i) => v.slice(i, i + 2)));
const overlap = (a,b) => {
  if (a===b || a.includes(b) || b.includes(a)) return 1;
  const left=grams(a), right=grams(b);
  if (!left.size || !right.size) return 0;
  let common=0; for(const gram of left) if(right.has(gram)) common++;
  return common/(left.size+right.size-common);
};

/** Pre-screen only approved-to-inspect synthetic input within a local reader.
 * One flagged pair blocks lexical clearance; no absence of flags proves
 * semantic independence. Never feed raw text to the GEPA metadata bridge.
 */
export function screenSyntheticCrossSplitLexicalOverlap(rows, {threshold=0.65}={}) {
  if (!Array.isArray(rows) || rows.length<2 || rows.length>48
      || typeof threshold!=='number' || !Number.isFinite(threshold)
      || threshold<0.5 || threshold>1) fail('inputs');
  const known=new Set(), groups=new Map(), normalized=[];
  for(const row of rows) {
    if (!row || typeof row!=='object' || Array.isArray(row)
        || !CHARACTER_IDS.includes(row.characterId)
        || !key(row.familyId)
        || !['development','optimizer_validation'].includes(row.split)
        || row.sourceType!=='synthetic'
        || !Array.isArray(row.turns) || !row.turns.length || row.turns.length>8
        || row.turns.some(x=>typeof x!=='string' || !x.trim() || x.length>500))
      fail('synthetic_families_only');
    const family=row.characterId+'|'+row.familyId;
    if(known.has(family)) fail('duplicate_family');
    known.add(family);
    const turns=row.turns.map(normalize);
    if(turns.some(x=>x.length<8)) fail('insufficient_text_for_lexical_screen');
    if(!groups.has(row.characterId))groups.set(row.characterId,new Set());
    groups.get(row.characterId).add(row.split);
    normalized.push({characterId:row.characterId,familyId:row.familyId,split:row.split,turns});
  }
  if([...groups.values()].some(s=>!s.has('development')||!s.has('optimizer_validation')))
    fail('per_character_split_coverage');

  let pairsChecked=0,turnPairsCompared=0;
  const flagged=[];
  for(let i=0;i<normalized.length;i++)for(let j=i+1;j<normalized.length;j++){
    const left=normalized[i],right=normalized[j];
    if(left.characterId!==right.characterId || left.split===right.split)continue;
    pairsChecked++;
    let highest=0;
    for(const x of left.turns)for(const y of right.turns){
      turnPairsCompared++;
      highest=Math.max(highest,overlap(x,y));
    }
    if(highest>=threshold)flagged.push({
      characterId:left.characterId,
      developmentFamilyId:left.split==='development'?left.familyId:right.familyId,
      optimizerValidationFamilyId:left.split==='optimizer_validation'?left.familyId:right.familyId,
      reason:'possible_lexical_overlap',
    });
  }
  return Object.freeze({
    schemaVersion:'character-synthetic-cross-split-lexical-v1',
    scenarioFamiliesScreened:rows.length,
    crossSplitFamilyPairsChecked:pairsChecked,
    turnPairsCompared,
    possibleOverlapCount:flagged.length,
    flaggedFamilies:Object.freeze(flagged.map(x=>Object.freeze(x))),
    lexicalScreenPassed:flagged.length===0,
    semanticIndependenceVerified:false,
    independentHumanReviewCompleted:false,
    privateLegacySourceCompared:false,
    optimizerAdmissionAuthorized:false,
    rawTextIncluded:false,
    externalCalls:0,
  });
}
