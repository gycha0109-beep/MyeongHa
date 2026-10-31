import { describe, expect, it } from 'vitest';

import {
  parseChatRoomReadPayloadV1,
  parseChatThreadIdV1,
  parseChatThreadRouteV1,
} from '../apps/web/chat-room-read-contract.js';

const THREAD_ID = '93000000-0000-4000-8000-000000000001';

function payload() {
  return {
    threadId: THREAD_ID,
    characterId: 'canonical-primary',
    contentReleaseId: 'internal-release-not-projected',
    contentBundleId: 'internal-bundle-not-projected',
    contentRevision: 7,
    afterSequenceNo: 0,
    lastSequenceNo: 2,
    messages: [
      {
        messageId: '96000000-0000-4000-8000-000000000001',
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        bodyText: 'hello',
        messagePayloadJsonb: { client: 'opaque' },
        messageSchemaVersion: null,
        createdAt: '2026-09-05T15:00:00.000Z',
        redacted: false,
        redactedAt: null,
      },
      {
        messageId: '96000000-0000-4000-8000-000000000002',
        sequenceNo: 2,
        senderType: 'character',
        characterId: 'canonical-primary',
        bodyText: 'source-backed answer',
        messagePayloadJsonb: {},
        messageSchemaVersion: 'dialogue-v1',
        createdAt: '2026-09-05T15:01:00.000Z',
        redacted: false,
        redactedAt: null,
      },
    ],
    relationship: { trust: 20 },
    pagination: {
      pageSize: 50,
      hasMore: false,
      nextAfterSequenceNo: null,
    },
  };
}

describe('browser Chat room read contract', () => {
  it('accepts the authoritative thread stream and projects only render-safe fields', () => {
    const result = parseChatRoomReadPayloadV1(payload(), {
      expectedThreadId: THREAD_ID,
      expectedAfterSequenceNo: 0,
    });

    expect(result).toEqual({
      threadId: THREAD_ID,
      characterId: 'canonical-primary',
      afterSequenceNo: 0,
      lastSequenceNo: 2,
      historyWithheld: false,
      messages: [
        {
          messageId: '96000000-0000-4000-8000-000000000001',
          sequenceNo: 1,
          senderType: 'user',
          characterId: null,
          bodyText: 'hello',
          createdAt: '2026-09-05T15:00:00.000Z',
          redacted: false,
          redactedAt: null,
        },
        {
          messageId: '96000000-0000-4000-8000-000000000002',
          sequenceNo: 2,
          senderType: 'character',
          characterId: 'canonical-primary',
          bodyText: 'source-backed answer',
          createdAt: '2026-09-05T15:01:00.000Z',
          redacted: false,
          redactedAt: null,
        },
      ],
      pagination: {
        pageSize: 50,
        hasMore: false,
        nextAfterSequenceNo: null,
      },
    });
    expect(result).not.toHaveProperty('contentReleaseId');
    expect(result).not.toHaveProperty('contentBundleId');
    expect(result).not.toHaveProperty('relationship');
    expect(result.messages[0]).not.toHaveProperty('messagePayloadJsonb');
  });

  it('admits only a metadata-only protected Se-yeon room and refuses any hidden-history body',()=>{
    const shell={
      threadId:THREAD_ID,characterId:'seyeon',
      afterSequenceNo:0,lastSequenceNo:0,
      messages:[],historyWithheld:true,
      pagination:{pageSize:50,hasMore:false,nextAfterSequenceNo:null},
    };
    expect(parseChatRoomReadPayloadV1(shell,{expectedThreadId:THREAD_ID}))
      .toMatchObject({characterId:'seyeon',messages:[],historyWithheld:true});
    expect(()=>parseChatRoomReadPayloadV1({...shell,characterId:'baekheon'},
      {expectedThreadId:THREAD_ID})).toThrow('protected Se-yeon room shell');
    expect(()=>parseChatRoomReadPayloadV1({...shell,historyWithheld:'true'},
      {expectedThreadId:THREAD_ID})).toThrow('historyWithheld is invalid');
    expect(()=>parseChatRoomReadPayloadV1({...shell,messages:payload().messages,lastSequenceNo:2},
      {expectedThreadId:THREAD_ID})).toThrow('protected Se-yeon room shell');
    expect(()=>parseChatRoomReadPayloadV1({...shell,afterSequenceNo:1,lastSequenceNo:1},
      {expectedThreadId:THREAD_ID,expectedAfterSequenceNo:1})).toThrow('protected Se-yeon room shell');
  });

  it('accepts only character-authored, server Planner pending Memory or Life Fact', () => {
    const original=payload();
    const proposal=Object.freeze({
      sourceAuthority:'server_dialogue_planner',
      characterId:'seyeon',
      proposalId:'97000000-0000-4000-8000-000000000001',
      proposalKind:'memory',
      proposalState:'pending',
      summary:'사용자는 나비라는 고양이를 키운다',
    });
    const room={
      ...original,characterId:'seyeon',
      messages:[
        original.messages[0]!,
        {...original.messages[1]!,characterId:'seyeon',memoryProposal:proposal},
      ],
    };
    const result=parseChatRoomReadPayloadV1(room,{expectedThreadId:THREAD_ID});
    expect(result.messages[1]?.memoryProposal).toEqual(proposal);
    expect(Object.isFrozen(result.messages[1]?.memoryProposal)).toBe(true);
    expect(result.messages[0]).not.toHaveProperty('memoryProposal');
    const lifeFact={...proposal,proposalKind:'life_fact'};
    expect(parseChatRoomReadPayloadV1({...room,messages:[
      room.messages[0],{...room.messages[1],memoryProposal:lifeFact},
    ]},{expectedThreadId:THREAD_ID}).messages[1]?.memoryProposal).toEqual(lifeFact);

    for(const forged of [
      {...proposal,sourceAuthority:'server_original_message'},
      {...proposal,proposalState:'accepted'},
      {...proposal,proposalId:'invalid'},
      {...proposal,characterId:'other'},
      {...proposal,summary:''},
      {...proposal,summary:'  spaced  '},
      {...proposal,grantCount:1},
      {...proposal,proposalKind:'unsupported'},
      null,
    ]){
      expect(()=>parseChatRoomReadPayloadV1({...room,messages:[
        room.messages[0],{...room.messages[1],memoryProposal:forged},
      ]},{expectedThreadId:THREAD_ID})).toThrow('Memory proposal lacks exact server Dialogue Planner authority');
    }
    for (const bodyText of [null,'','   ']) {
      expect(()=>parseChatRoomReadPayloadV1({...room,messages:[
        room.messages[0],{...room.messages[1],bodyText},
      ]},{expectedThreadId:THREAD_ID})).toThrow(
        'Memory proposal lacks exact server Dialogue Planner authority');
    }
    expect(()=>parseChatRoomReadPayloadV1({...room,messages:[
      {...room.messages[0],memoryProposal:proposal},room.messages[1],
    ]},{expectedThreadId:THREAD_ID})).toThrow('Memory proposal lacks exact server Dialogue Planner authority');
    const legacy={sourceAuthority:'server_original_message',characterId:'seyeon',
      redacted:false,threadId:THREAD_ID,turnId:'97000000-0000-4000-8000-000000000002',
      messageId:room.messages[0]!.messageId};
    expect(()=>parseChatRoomReadPayloadV1({...room,messages:[
      {...room.messages[0],memoryProposalOffer:legacy},room.messages[1],
    ]},{expectedThreadId:THREAD_ID})).toThrow('manual original-message Memory offer is unsupported');
    expect(()=>parseChatRoomReadPayloadV1({...room,historyWithheld:true},
      {expectedThreadId:THREAD_ID})).toThrow('protected Se-yeon room shell');
  });

  it('requires bounded pagination metadata to match the authoritative stream', () => {
    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), pagination: { pageSize: 51, hasMore: false, nextAfterSequenceNo: null } },
      { expectedThreadId: THREAD_ID },
    )).toThrow('pagination bound is invalid');

    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), pagination: { pageSize: 50, hasMore: true, nextAfterSequenceNo: 1 } },
      { expectedThreadId: THREAD_ID },
    )).toThrow('pagination cursor does not match');

    const nextPage = parseChatRoomReadPayloadV1(
      { ...payload(), pagination: { pageSize: 50, hasMore: true, nextAfterSequenceNo: 2 } },
      { expectedThreadId: THREAD_ID },
    );
    expect(nextPage.pagination).toEqual({
      pageSize: 50,
      hasMore: true,
      nextAfterSequenceNo: 2,
    });
  });

  it('keeps server Character identity independent from untrusted response presentation fields', () => {
    const result = parseChatRoomReadPayloadV1(
      {
        ...payload(),
        presentationKey: 'baekheon',
        displayName: '백헌',
        characterTitle: '충추원의 장',
        portraitUrl: '/assets/characters/baekheon-portrait.webp',
      },
      {
        expectedThreadId: THREAD_ID,
        expectedAfterSequenceNo: 0,
      },
    );

    expect(result.characterId).toBe('canonical-primary');
    expect(result).not.toHaveProperty('presentationKey');
    expect(result).not.toHaveProperty('displayName');
    expect(result).not.toHaveProperty('characterTitle');
    expect(result).not.toHaveProperty('portraitUrl');
  });

  it('rejects a response for a different thread or cursor', () => {
    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), threadId: '93000000-0000-4000-8000-000000000002' },
      { expectedThreadId: THREAD_ID },
    )).toThrow('threadId does not match');

    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), afterSequenceNo: 4 },
      { expectedThreadId: THREAD_ID },
    )).toThrow('afterSequenceNo does not match');
  });

  it('rejects non-increasing streams and inconsistent lastSequenceNo', () => {
    const duplicateSequence = payload();
    duplicateSequence.messages[1]!.sequenceNo = 1;
    expect(() => parseChatRoomReadPayloadV1(duplicateSequence, {
      expectedThreadId: THREAD_ID,
    })).toThrow('not strictly increasing');

    expect(() => parseChatRoomReadPayloadV1(
      { ...payload(), lastSequenceNo: 99 },
      { expectedThreadId: THREAD_ID },
    )).toThrow('lastSequenceNo does not match');
  });

  it('rejects unsupported sender types and sender/Character identity shape drift', () => {
    const base = payload();

    expect(() => parseChatRoomReadPayloadV1({
      ...base,
      messages: [
        { ...base.messages[0]!, senderType: 'assistant' },
        base.messages[1]!,
      ],
    }, { expectedThreadId: THREAD_ID })).toThrow('senderType is unsupported');

    expect(() => parseChatRoomReadPayloadV1({
      ...base,
      messages: [
        base.messages[0]!,
        { ...base.messages[1]!, characterId: null },
      ],
    }, { expectedThreadId: THREAD_ID })).toThrow('character message is missing characterId');

    expect(() => parseChatRoomReadPayloadV1({
      ...base,
      messages: [
        { ...base.messages[0]!, characterId: 'canonical-primary' },
        base.messages[1]!,
      ],
    }, { expectedThreadId: THREAD_ID })).toThrow('non-character message exposed characterId');

    expect(() => parseChatRoomReadPayloadV1({
      ...base,
      messages: [
        { ...base.messages[0]!, senderType: 'system', characterId: 'canonical-primary' },
        base.messages[1]!,
      ],
    }, { expectedThreadId: THREAD_ID })).toThrow('non-character message exposed characterId');
  });

  it('rejects redacted content leaks at the browser trust boundary', () => {
    const base = payload();
    const leaked = {
      ...base,
      messages: [
        base.messages[0]!,
        {
          ...base.messages[1]!,
          bodyText: 'must not render',
          messagePayloadJsonb: null,
          redacted: true,
          redactedAt: '2026-09-05T15:02:00.000Z',
        },
      ],
    };

    expect(() => parseChatRoomReadPayloadV1(leaked, {
      expectedThreadId: THREAD_ID,
    })).toThrow('redacted message exposed content');
  });

  it('accepts only UUID thread route identities', () => {
    expect(parseChatThreadIdV1(THREAD_ID)).toBe(THREAD_ID);
    expect(parseChatThreadIdV1('not-a-thread')).toBeNull();
    expect(parseChatThreadIdV1('')).toBeNull();
    expect(parseChatThreadIdV1(null)).toBeNull();
  });


  it('fails closed on duplicate or malformed thread route identities', () => {
    expect(parseChatThreadRouteV1('')).toEqual({ state: 'none', threadId: null });
    expect(parseChatThreadRouteV1(`?threadId=${THREAD_ID}`)).toEqual({
      state: 'ready',
      threadId: THREAD_ID,
    });
    expect(parseChatThreadRouteV1(
      `?threadId=${THREAD_ID}&threadId=93000000-0000-4000-8000-000000000002`,
    )).toEqual({ state: 'invalid', threadId: null });
    expect(parseChatThreadRouteV1('?threadId=not-a-thread')).toEqual({
      state: 'invalid',
      threadId: null,
    });
  });
});
