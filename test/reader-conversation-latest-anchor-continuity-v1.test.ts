import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  inspectReaderLatestAssistantObservationV1 as inspect,
  prepareReaderLatestAnchorContinuityV1 as prepare,
} from '../apps/api/src/reader-conversation-latest-anchor-continuity-v1.js';
import type {
  ReaderRecentMessageAuthorityRowV1,
} from '../apps/api/src/reader-context-non-memory-read.js';

const reader='reader-one';
const rows: readonly ReaderRecentMessageAuthorityRowV1[]=[
  {
    messageId:'latest-user',sequenceNo:13,senderType:'user',
    characterId:null,text:'그 부분을 다시 설명해 주세요.',
    createdAt:'2026-10-22T10:01:00Z',
  },
  {
    messageId:'guarded-official-answer',sequenceNo:12,senderType:'character',
    characterId:reader,text:'PRIVATE_OFFICIAL_READING_CANNOT_ESCAPE',
    createdAt:'2026-10-22T10:00:00Z',
  },
  {
    messageId:'previous-user',sequenceNo:11,senderType:'user',
    characterId:null,text:'PRIVATE_USER_QUERY',
    createdAt:'2026-10-22T09:59:00Z',
  },
] as const;

describe('RR-08 latest guarded Assistant source cannot be confused with old ordinary chat',()=>{
  it('examines only current DB sequence and ID, never private message body',()=>{
    const result=inspect({rows,expectedReaderCharacterId:reader});
    expect(result.mode).toBe('latest_assistant_metadata');
    if(result.mode!=='latest_assistant_metadata')return;
    expect(result.assistantMessageId).toBe('guarded-official-answer');
    expect(result.metadataDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(result.permitsSourceAuthority).toBe(false);
    const encoded=JSON.stringify(result);
    expect(encoded).not.toContain('PRIVATE_OFFICIAL_READING_CANNOT_ESCAPE');
    expect(encoded).not.toContain('PRIVATE_USER_QUERY');
  });

  it('sorts by DB sequence number rather than trusting adapter order',()=>{
    const initial=inspect({rows,expectedReaderCharacterId:reader});
    const reordered=inspect({rows:[rows[2]!,rows[0]!,rows[1]!],expectedReaderCharacterId:reader});
    expect(reordered).toEqual(initial);
  });

  it('detects intervening unrelated Reader answer and rejects use of older Saju anchor',()=>{
    const changed=inspect({rows:[
      {...rows[0]!,sequenceNo:15},
      {...rows[1]!,sequenceNo:12},
      {...rows[2]!,sequenceNo:11},
      {
        messageId:'unrelated-ordinary-assistant',sequenceNo:14,
        senderType:'character',characterId:reader,
        text:'오늘은 일상 얘기부터 해요.',
        createdAt:'2026-10-22T10:02:00Z',
      },
    ],expectedReaderCharacterId:reader});
    expect(changed.mode).toBe('latest_assistant_metadata');
    if(changed.mode==='latest_assistant_metadata'){
      expect(changed.assistantMessageId).toBe('unrelated-ordinary-assistant');
    }
  });

  it.each([
    ['duplicate message ID',[rows[0]!,{...rows[1]!,messageId:'latest-user'}]],
    ['duplicate sequence',[rows[0]!,{...rows[1]!,sequenceNo:13}]],
    ['wrong Reader',[rows[0]!,{...rows[1]!,characterId:'other-reader'}]],
    ['user claiming to be Reader',[{...rows[0]!,characterId:reader},rows[1]!]],
    ['missing message ID',[{...rows[0]!,messageId:''},rows[1]!]],
    ['unknown role',[rows[0]!,{...rows[1]!,senderType:'system'}]],
    ['invalid sequence',[rows[0]!,{...rows[1]!,sequenceNo:-1}]],
    ['invalid time',[rows[0]!,{...rows[1]!,createdAt:'yesterday'}]],
  ] as const)('rejects malformed or cross-authority transcript rows: %s',(_name,invalid)=>{
    expect(inspect({rows:invalid as readonly ReaderRecentMessageAuthorityRowV1[],expectedReaderCharacterId:reader}))
      .toMatchObject({mode:'hold',reason:'SOURCE_UNAVAILABLE'});
  });

  it('does not promote absent Reader answer or empty/oversized windows',()=>{
    expect(inspect({rows:[rows[0]!],expectedReaderCharacterId:reader}))
      .toMatchObject({mode:'hold',reason:'LATEST_ASSISTANT_UNAVAILABLE'});
    expect(inspect({rows:[],expectedReaderCharacterId:reader}))
      .toMatchObject({mode:'hold',reason:'SOURCE_UNAVAILABLE'});
    expect(inspect({rows:Array.from({length:33},(_,i)=>({
      ...rows[0]!,messageId:'msg-'+i,sequenceNo:i,
    })),expectedReaderCharacterId:reader}))
      .toMatchObject({mode:'hold',reason:'SOURCE_UNAVAILABLE'});
  });

  it('refuses structural clones before opening the transcript or DB-owned validated anchor',async()=>{
    const readRecentMessages=vi.fn(async()=>rows);
    const readLatestValidatedAnchor=vi.fn(async()=>null);
    const result=await prepare({
      preflight:{} as never,
      grounded:{} as never,
      anchorAuthorityPort:{readLatestValidatedAnchor},
      recentMessageAuthorityPort:{readRecentMessages},
    });
    expect(result).toMatchObject({
      mode:'hold',reason:'SOURCE_UNAVAILABLE',
      permitsModelInjection:false,permitsCommit:false,
      permitsHttpReveal:false,addedModelCalls:0,
    });
    expect(readRecentMessages).not.toHaveBeenCalled();
    expect(readLatestValidatedAnchor).not.toHaveBeenCalled();
  });

  it('uses current preflight + grounding, existing anchor selector and latest DB Reader message without any paid dispatch',()=>{
    const src=readFileSync(new URL(
      '../apps/api/src/reader-conversation-latest-anchor-continuity-v1.ts',
      import.meta.url),'utf8');
    for(const required of [
      'assertServerPreparedStandardChatPreflightV2',
      'assertServerPreparedStandardChatGroundingV2',
      'classifyCharacterStandardFollowupQuestionScopeV1',
      'assertServerPreparedStandardFollowupQuestionScopeV1',
      'readRecentMessages',
      "before.assistantMessageId!==evidence.assistantMessageId",
      "after.metadataDigest!==before.metadataDigest",
      'permitsModelInjection:false','permitsCommit:false',
      'permitsHttpReveal:false','addedModelCalls:0',
    ])expect(src).toContain(required);
    expect(src).not.toContain('OPENAI_API_KEY');
    expect(src).not.toContain('.generate(');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('response.body');
  });
});
