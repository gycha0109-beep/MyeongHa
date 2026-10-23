// Watchtower-Track: security
// §61 S5/G3 negative-only original Memory first Reveal ↔ G2 Commit Outbox.
import {describe,expect,it} from 'vitest';
import type {ServerResponse} from 'node:http';
import {
  deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import type {RunProductionSeyeonChatResultV1} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';

const AUTH='d0000000-0000-4000-8000-000000000001';
const SUBJECT='d1000000-0000-4000-8000-000000000001';
const THREAD='d2000000-0000-4000-8000-000000000003';
const TURN='d3000000-0000-4000-8000-000000000004';
const ATTEMPT='d4000000-0000-4000-8000-000000000005';
const ASSISTANT='d5000000-0000-4000-8000-000000000006';
const USER='d6000000-0000-4000-8000-000000000007';
const POST='d7000000-0000-4000-8000-000000000008';
const OTHER='d7000000-0000-4000-8000-000000000009';

function result():RunProductionSeyeonChatResultV1 {
  return {
    subjectId:SUBJECT,
    threadBinding:{threadId:THREAD,participantCharacterIds:['seyeon']},
    execution:{
      disposition:'executed',
      receivedTurn:{
        turnId:TURN,userMessageId:USER,userText:'원본 합성 메시지',
        threadCharacterId:'seyeon',turnState:'received',replayed:false,committedTurn:null,
      },
      attempt:{attemptId:ATTEMPT,replayed:false},
      committedTurn:{
        turnId:TURN,attemptId:ATTEMPT,assistantMessageId:ASSISTANT,
        postTurnOutboxEventId:POST,sequenceNo:1,replayed:false,
      },
      postTurnAnalysis:{status:'deferred',outboxEventId:POST},
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}

type MutableResult={
  execution:{
    committedTurn:{postTurnOutboxEventId?:string;sequenceNo:number};
    postTurnAnalysis?:{status:string;outboxEventId?:string};
    receivedTurn:{userMessageId?:string;turnState:string};
  };
};

describe('S5/G3 first private Reply requires original G2 durable post-turn Outbox',()=>{
  it.each([
    ['invalid zero Commit sequence',(r:MutableResult)=>{
      r.execution.committedTurn.sequenceNo=0;
    }],
    ['negative Commit sequence',(r:MutableResult)=>{
      r.execution.committedTurn.sequenceNo=-1;
    }],
    ['previous committed User Turn',(r:MutableResult)=>{
      r.execution.receivedTurn.turnState='committed';
    }],
    ['already delivered User Turn',(r:MutableResult)=>{
      r.execution.receivedTurn.turnState='delivered';
    }],
    ['retryable failed User Turn',(r:MutableResult)=>{
      r.execution.receivedTurn.turnState='failed_retryable';
    }],
    ['missing original G2 Outbox',(r:MutableResult)=>{
      delete r.execution.committedTurn.postTurnOutboxEventId;
    }],
    ['malformed original G2 Outbox',(r:MutableResult)=>{
      r.execution.committedTurn.postTurnOutboxEventId='not-a-uuid';
    }],
    ['different deferred worker Outbox',(r:MutableResult)=>{
      r.execution.postTurnAnalysis!.outboxEventId=OTHER;
    }],
    ['missing post-turn outcome',(r:MutableResult)=>{
      delete r.execution.postTurnAnalysis;
    }],
    ['invented post-turn outcome',(r:MutableResult)=>{
      r.execution.postTurnAnalysis={status:'none'};
    }],
    ['missing original DB User Message identity',(r:MutableResult)=>{
      delete r.execution.receivedTurn.userMessageId;
    }],
    ['malformed original DB User Message identity',(r:MutableResult)=>{
      r.execution.receivedTurn.userMessageId='not-a-uuid';
    }],
  ] as const)('denies %s before ANY original Grant SQL',async(_label,mutate)=>{
    const value=result() as unknown as MutableResult;
    mutate(value);
    let dbConnections=0;
    let destroyed=false;
    const pool:PostgresSubjectPoolV1={
      connect(){
        dbConnections++;
        throw Error('G3 original Grant DB must not be contacted');
      },
    };
    const response={
      headersSent:false,writableEnded:false,destroyed:false,
      socket:{},destroy(){destroyed=true;},
    } as unknown as ServerResponse;
    await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response,requestSignal:new AbortController().signal,
      pool,verifiedEvidence:{kind:'member',verifiedAuthUserId:AUTH},
      result:value as unknown as RunProductionSeyeonChatResultV1,
      expectedThreadId:THREAD,
      expectedClientTurnId:TURN,
      requestId:'g3-outbox-original-lineage',
      serverTime:'2026-10-23T00:00:00.000Z',
    })).rejects.toMatchObject({code:'INVALID_COMMIT'});
    expect(destroyed).toBe(true);
    expect(dbConnections).toBe(0);
  });
});
