// Watchtower-Track: security
// R36: isolated bootstrap material derived from the ACTUAL server-authored
// Interpreter + Character code. Public authored policy only; no user data.
// The PostgreSQL Owner freezes one snapshot before any synthetic admission.
// This is NOT a Production signing authority or a real prompt approval.
import {
  assembleSeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
} from './seyeon-character-runtime-v2.js';
import {
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
} from './openai-seyeon-structured-provider-v1.js';

export const SEYEON_R36_MANIFEST_ID=
  'seyeon-two-original-offline-interpreter-static-r36' as const;

export function buildSeyeonR36OfflineAuthoredManifestV1(){
  const context=assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,
    integrityDecisions:[],governedPreflightApplied:false,
    recentMessages:[],
    retrievedMemories:[
      {
        memoryId:'memory:eb000000-0000-4000-8000-000000000001',
        kind:'memory' as const,claimKind:'fact' as const,
        summary:'synthetic model projection 0',
        sourceRef:'memory:eb000000-0000-4000-8000-000000000001:grant:ec000000-0000-4000-8000-000000000001',
        relevance:0.9,salience:0.8,
      },
      {
        memoryId:'memory:eb000000-0000-4000-8000-000000000002',
        kind:'memory' as const,claimKind:'fact' as const,
        summary:'synthetic model projection 1',
        sourceRef:'memory:eb000000-0000-4000-8000-000000000002:grant:ec000000-0000-4000-8000-000000000002',
        relevance:0.8,salience:0.8,
      },
    ],
    disclosure:{decision:null,retrievedSources:[]},
  });
  const request=buildSeyeonTurnInterpreterRequestV2(context);
  const format=request.responseSchema;
  if(request.purpose!=='turn_interpretation'
    ||context.recentConversation.length!==0
    ||context.retrievedMemories.length!==2
    ||context.relationship!==null
    ||context.disclosure.decision!==null
    ||context.integrity.governedPreflightApplied!==false)
    throw new Error('R36 refuses any non-baseline authored Character snapshot');
  return Object.freeze({
    interpreterInstructions:request.instructions+'\n\n'+
      SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
    responseSchema:format,
    contextSchemaVersion:context.schemaVersion,
    character:context.character,
    authorityBoundaries:context.authorityBoundaries,
    bibleSlices:context.bibleSlices,
    actionPolicy:context.actionPolicy,
    allowedInterpretationVocabulary:
      (request.input as {
        allowedInterpretationVocabulary:unknown;
      }).allowedInterpretationVocabulary,
  });
}
