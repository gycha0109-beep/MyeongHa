import type { SeyeonRecentMessageV2 } from
  '../../../packages/domain/src/index.js';
import {
  hashSeyeonC08PublicTranscriptV1,
  SEYEON_C08_PUBLIC_THREAD_COMMITMENT_V1,
  SeyeonC08LocalHoldV1,
  type SeyeonC08FullThreadIntegrityPortV1,
} from './seyeon-c08-local-one-call-shadow-v1.js';

/**
 * Research-only adapter for an AUTHENTICATED, DB-backed complete-thread read.
 * The callback MUST come from server authority. Never pass a client transcript,
 * a recent-message window, or a model-provided response as the source.
 */
export interface SeyeonC08AuthoritativeThreadReadV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly complete:true;
  readonly messages:readonly SeyeonRecentMessageV2[];
}

export function createSeyeonC08LocalThreadIntegrityPortV1(input:Readonly<{
  subjectId:string;
  threadId:string;
  readCompleteServerThread: (query:Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
  }>) => Promise<SeyeonC08AuthoritativeThreadReadV1>;
}>):SeyeonC08FullThreadIntegrityPortV1{
  const invalid=()=>new SeyeonC08LocalHoldV1('LOCAL_CONTEXT_NOT_PROVEN');
  if(typeof input?.subjectId!=='string'||!input.subjectId.trim()||
     typeof input.threadId!=='string'||!input.threadId.trim()||
     input.subjectId.length>256||input.threadId.length>256||
     typeof input.readCompleteServerThread!=='function')throw invalid();
  async function read(query:Readonly<{
    subjectId:string;threadId:string;currentUserMessageId:string;
  }>){
    if(query.subjectId!==input.subjectId||query.threadId!==input.threadId||
       typeof query.currentUserMessageId!=='string'||
       !query.currentUserMessageId.trim())throw invalid();
    let result: SeyeonC08AuthoritativeThreadReadV1;
    try{result=await input.readCompleteServerThread(query);}
    catch{throw invalid();}
    if(!result||result.complete!==true||
       result.subjectId!==input.subjectId||result.threadId!==input.threadId||
       !Array.isArray(result.messages)||
       result.messages.length<1||result.messages.length>7||
       result.messages.length%2!==1)throw invalid();
    const seen=new Set<string>();
    for(let i=0;i<result.messages.length;i++){
      const m=result.messages[i];
      if(!m||typeof m.messageId!=='string'||!m.messageId.trim()||
         m.messageId.length>256||seen.has(m.messageId)||
         m.role!==(i%2===0?'user':'assistant')||
         typeof m.text!=='string'||!m.text.trim())throw invalid();
      seen.add(m.messageId);
    }
    if(result.messages[result.messages.length-1]?.messageId!==
       query.currentUserMessageId)throw invalid();
    return result.messages;
  }
  return Object.freeze({
    subjectId:input.subjectId,
    threadId:input.threadId,
    async readFullThreadCensus(query){
      const messages=await read(query);
      if(messages.length!==1)throw invalid();
      return Object.freeze({
        schemaVersion:'seyeon-first-turn-census-shadow-v1' as const,
        subjectId:input.subjectId,threadId:input.threadId,
        currentUserMessageId:query.currentUserMessageId,
        messageCount:1,latestSenderType:'user' as const,complete:true as const,
      });
    },
    async readAuthoritativeThreadCommitment(query){
      const messages=await read(query);
      if(messages.length===1)throw invalid();
      return Object.freeze({
        schemaVersion:SEYEON_C08_PUBLIC_THREAD_COMMITMENT_V1,
        subjectId:input.subjectId,threadId:input.threadId,
        currentUserMessageId:query.currentUserMessageId,
        messageCount:messages.length,latestSenderType:'user' as const,
        complete:true as const,
        transcriptHash:hashSeyeonC08PublicTranscriptV1(messages),
      });
    },
  });
}
