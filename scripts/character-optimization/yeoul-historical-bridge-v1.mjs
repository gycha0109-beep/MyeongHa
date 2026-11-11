/** Consume validated Yeoul offline records locally; export only aggregate, non-verbatim diagnostics. */
import {digest} from './contracts-v1.mjs';

const MODELS = Object.freeze(['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b']);
const VARIANTS = Object.freeze(['baseline','language_rules','conversation_examples']);
const RATINGS = Object.freeze(['good','awkward','fiction','harsh','flat','persona','soft','other']);
const CLASSES = Object.freeze(['negative_user_rating','positive_with_caveat','clean_positive_candidate']);
const EVIDENCE = Object.freeze(['user_rating','user_detail','note_heuristic_unconfirmed']);
const fail=x=>{throw new Error('YEOUL_HISTORICAL_BRIDGE_INVALID:'+x)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

/** Never hand private input, reply, note or evidence text to GEPA. */
export function summarizeHistoricalYeoulForOptimizer({ records, experimentRunId }) {
  if (experimentRunId!==42572722295 || !Array.isArray(records) || records.length!==288) fail('source_identity');
  const seen=new Set(), allRatings=Object.fromEntries(RATINGS.map(x=>[x,0]));
  const diagnosticEvidence=new Map(), byQuestion=new Map(), byVariant=new Map();
  let deepSeekCount=0, unreviewed=0, caveatedPositives=0;
  for (const record of records) {
    if (!obj(record)||!obj(record.source)||!obj(record.diagnostic)) fail('record');
    const row=record.source, diag=record.diagnostic;
    if(!/^Y(0[1-9]|1[0-2])$/.test(row.id)||!MODELS.includes(row.model)||!VARIANTS.includes(row.variant)
      ||![1,2].includes(row.repeat)||!obj(row.evaluation)||!RATINGS.includes(row.evaluation.rating)
      || !CLASSES.includes(diag.classification) || !Array.isArray(diag.evidence)) fail('row_identity');
    const key=[row.id,row.variant,row.repeat,row.model].join('|');
    if(seen.has(key)||diag.originalKey!==key||diag.originalRating!==row.evaluation.rating) fail('source_key_or_duplicate');
    seen.add(key);
    allRatings[row.evaluation.rating]++;
    if(diag.reviewStatus==='unreviewed')unreviewed++;
    else fail('unexpected_review_authority');
    if ((row.evaluation.rating==='good' && diag.classification==='negative_user_rating')
        || (row.evaluation.rating!=='good' && diag.classification!=='negative_user_rating'))fail('classification');
    if(diag.classification==='positive_with_caveat')caveatedPositives++;
    for(const evidence of diag.evidence){
      if(!obj(evidence)||typeof evidence.tag!=='string'||!EVIDENCE.includes(evidence.origin))fail('evidence_origin');
    }
    if(row.model!=='deepseek/deepseek-v4.1-flash-1017')continue;
    deepSeekCount++;
    const question=byQuestion.get(row.id)??{count:0,ratings:Object.fromEntries(RATINGS.map(x=>[x,0]))};
    question.count++;question.ratings[row.evaluation.rating]++;byQuestion.set(row.id,question);
    const variant=byVariant.get(row.variant)??{count:0,good:0};
    variant.count++;if(row.evaluation.rating==='good')variant.good++;byVariant.set(row.variant,variant);
    for(const evidence of diag.evidence){
      if(!obj(evidence)||typeof evidence.tag!=='string'||!EVIDENCE.includes(evidence.origin))fail('evidence_origin');
      // A note-based heuristic is never promoted to an owner-confirmed failure label.
      const safeTag=/^[a-z0-9_]{1,60}$/.test(evidence.tag)?evidence.tag:'unmapped_local_tag';
      const counts=diagnosticEvidence.get(safeTag)??{user_rating:0,user_detail:0,note_heuristic_unconfirmed:0};
      counts[evidence.origin]++;diagnosticEvidence.set(safeTag,counts);
    }
  }
  if(seen.size!==288||deepSeekCount!==72||unreviewed!==288)fail('matrix_or_review_count');
  for (const m of MODELS)for(const v of VARIANTS)for(let i=1;i<=12;i++)for(const repeat of [1,2]){
    if(!seen.has([`Y${String(i).padStart(2,'0')}`,v,repeat,m].join('|')))fail('missing_matrix_row');
  }
  return Object.freeze({schemaVersion:'yeoul-historical-private-feedback-summary-v1',
    provenance:{experimentRunId,privateDataPreserved:true,rawRepliesExported:false,
      rawRatingsModified:false,qualityGainEstablished:false},
    dataRole:'legacy_development_only',studentModelId:'deepseek/deepseek-v4.1-flash-1017',
    studentRows:deepSeekCount, legacyRows:records.length, originalRatingCounts:allRatings,
    positiveWithCaveatCount:caveatedPositives,
    byQuestion:Object.fromEntries([...byQuestion].sort(([a],[b])=>a.localeCompare(b))),
    byVariant:Object.fromEntries([...byVariant].sort(([a],[b])=>a.localeCompare(b))),
    diagnosticSignals:Object.fromEntries([...diagnosticEvidence].sort(([a],[b])=>a.localeCompare(b))),
    familyIds:[...byQuestion.keys()].sort(),
    dataAccess:'private_local_only',humanReviewApprovedCount:0,
    summaryDigest:digest({allRatings,deepSeekCount,byQuestion:[...byQuestion],byVariant:[...byVariant]})});
}