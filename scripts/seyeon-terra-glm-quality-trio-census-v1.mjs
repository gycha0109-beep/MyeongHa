/**
 * EXACT three public synthetic first-turn quality cases, isolated from the
 * immutable sixteen-case dialogue-path benchmark. No DB, no personal source.
 * The guarded runtime still requires 4 full-thread census reads per case.
 */
const IDS=Object.freeze(['N06','N10','N21']);
export function createSeyeonQualityTrioSyntheticCensusV1(caseId,userMessageId){
 if(!IDS.includes(caseId)||userMessageId!=='synthetic:'+caseId)
  throw new TypeError('QUALITY_TRIO_SYNTHETIC_CASE_HOLD');
 let readCount=0;
 const subjectId='synthetic-subject:'+caseId;
 const threadId='synthetic-thread:'+caseId;
 return Object.freeze({
  port:Object.freeze({
   subjectId,threadId,
   readFullThreadCensus(input){
    if(input?.subjectId!==subjectId||
       input?.threadId!==threadId||
       input?.currentUserMessageId!==userMessageId||readCount>=4)
      throw new TypeError('QUALITY_TRIO_SYNTHETIC_CENSUS_HOLD');
    readCount++;
    return Object.freeze({
     schemaVersion:'seyeon-first-turn-census-shadow-v1',
     subjectId,threadId,currentUserMessageId:userMessageId,
     messageCount:1,latestSenderType:'user',complete:true,
    });
   },
  }),
  get readCount(){return readCount;},
 });
}
