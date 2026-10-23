import type {SeyeonFullThreadCensusShadowPortV1} from
 '../../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1} from
 '../../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';

export function syntheticFirstTurnCensusShadowV1():
 SeyeonFullThreadCensusShadowPortV1 {
 return {
  subjectId:'fixture-subject',threadId:'fixture-thread',
  readFullThreadCensus({subjectId,threadId,currentUserMessageId}){
   return {
    schemaVersion:SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
    subjectId,threadId,currentUserMessageId,
    messageCount:1,latestSenderType:'user',complete:true,
   };
  },
 };
}
