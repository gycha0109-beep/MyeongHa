import { CHARACTER_IDS, fail, keys, sha256 } from './contracts.mjs';

const RATINGS = Object.freeze(['good','awkward','fiction','harsh','flat','persona','soft','other']);
const CLASSES = Object.freeze(['negative_user_rating','positive_with_caveat','clean_positive_candidate']);
const ORIGINS = Object.freeze(['user_rating','user_detail','note_heuristic_unconfirmed']);
const TAG_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Accepts DIAGNOSTIC entries only, not `transformForOffline().records` or raw chat replies.
 * Existing Yeoul transform callers must pass `records.map(r => r.diagnostic)`
 * within a protected local process. This adapter discards human text evidence.
 */
export function normalizeLegacyDiagnosticMetadata(characterId, diagnostics) {
  if (!CHARACTER_IDS.includes(characterId)) fail('diagnostics.characterId','unknown character');
  if (!Array.isArray(diagnostics)) fail('diagnostics','array required');
  const seen=new Set(); const counts=Object.fromEntries(RATINGS.map(r=>[r,0]));
  const normalized=diagnostics.map((d,i)=>{
    keys(d,['originalKey','originalRating','classification','evidence','sourceAuthority','reviewStatus'],['originalKey','originalRating','classification','evidence','sourceAuthority','reviewStatus'],`diagnostics.${i}`);
    if (typeof d.originalKey !== 'string' || d.originalKey.length<1 || d.originalKey.length>320 || seen.has(d.originalKey)) fail('diagnostics.originalKey','duplicate or invalid');
    seen.add(d.originalKey);
    if (!RATINGS.includes(d.originalRating) || !CLASSES.includes(d.classification)) fail('diagnostics.rating','unknown rating/classification');
    if ((d.originalRating==='good' && d.classification==='negative_user_rating') || (d.originalRating!=='good' && d.classification!=='negative_user_rating')) fail('diagnostics.rating','classification inconsistent with rating');
    if (!Array.isArray(d.evidence)) fail('diagnostics.evidence','array required');
    if (d.reviewStatus !== 'unreviewed') fail('diagnostics.reviewStatus','review status cannot be promoted');
    if (!Array.isArray(d.sourceAuthority) || !d.sourceAuthority.every(x=>typeof x==='string' && x.startsWith(`docs/character/${characterId.toUpperCase()}_CHARACTER_`))) fail('diagnostics.sourceAuthority','unexpected character source');
    const signals=[]; const seenSignals=new Set();
    for (const e of d.evidence) {
      keys(e,['tag','origin','evidence'],['tag','origin','evidence'],`diagnostics.${i}.evidence`);
      if (typeof e.tag!=='string' || !TAG_PATTERN.test(e.tag) || !ORIGINS.includes(e.origin)) fail('diagnostics.signal','invalid signal');
      // e.evidence may contain human free-text notes, which never leave the local process.
      if (typeof e.evidence!=='string') fail('diagnostics.evidence','invalid evidence text');
      const id=`${e.origin}:${e.tag}`;
      if (!seenSignals.has(id)) {seenSignals.add(id);signals.push(Object.freeze({tag:e.tag,origin:e.origin,confirmedByOwner:e.origin==='user_rating'||e.origin==='user_detail'}));}
    }
    counts[d.originalRating]++;
    return Object.freeze({characterId,sourceKeySha256:sha256(d.originalKey),source:'owner_rating',datasetRole:'development',rating:d.originalRating,classification:d.classification,signals:Object.freeze(signals),exampleApproved:false,hardViolationVerified:false,reflectionSafeOnlyAfterSeparateReview:true});
  });
  return Object.freeze({characterId,count:normalized.length,ratingCounts:Object.freeze(counts),records:Object.freeze(normalized),humanExampleApprovals:0,qualityGainEstablished:false});
}
