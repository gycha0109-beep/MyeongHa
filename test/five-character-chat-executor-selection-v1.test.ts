import { describe, expect, it } from 'vitest';
import {
  FIVE_CHARACTER_CHAT_TARGETS_V1,
  CharacterChatExecutorUnavailableV1,
  selectPublishedFiveCharacterChatExecutorV1,
} from '../apps/api/src/five-character-chat-executor-selection-v1.js';

const ids=['seyeon','baekheon','yeoul','rahyeon','taegyeom'] as const;
const bundleId='7a44b444-4444-4444-8444-444444444444';
const binding=(characterId:string)=>({
  threadId:'eaeeaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  activeContentReleaseId:'eaeeaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
  activeContentBundleId:bundleId,
  contentRevision:0,
  participantCharacterIds:[characterId],
});
const manifest=(characterId:string)=>({
  contentBundleId:bundleId,
  manifest:{
    contentVersion:'approved-v1',
    minClientCapability:'v1',
    assetManifestHash:'sha256:v1:'+'0'.repeat(64),
    cueSchemaVersion:'v1',
    characterIds:[characterId],
  },
});

describe('Five-character Member live-chat production executor selection',()=>{
  it('lists only the five requested chat runtime targets',()=>{
    expect(FIVE_CHARACTER_CHAT_TARGETS_V1).toEqual(ids);
    expect(FIVE_CHARACTER_CHAT_TARGETS_V1).not.toContain('yunho');
  });
  it.each(ids)('selects only a server-registered executor for %s',characterId=>{
    const port=()=>characterId;
    expect(selectPublishedFiveCharacterChatExecutorV1(
      binding(characterId),manifest(characterId),{[characterId]:port},
    )).toEqual({characterId,executor:port});
  });
  it('never substitutes Se-yeon for any other Character',()=>{
    for (const id of ids.slice(1)) {
      expect(()=>selectPublishedFiveCharacterChatExecutorV1(
        binding(id),manifest(id),{seyeon:()=>true},
      )).toThrow(CharacterChatExecutorUnavailableV1);
    }
  });
  it('rejects Yunho even if somebody registers an executor',()=>{
    expect(()=>selectPublishedFiveCharacterChatExecutorV1(
      binding('yunho'),manifest('yunho'),{yunho:()=>true} as never,
    )).toThrow(CharacterChatExecutorUnavailableV1);
  });
  it('rejects multi-participant, missing manifest identity and foreign bundle',()=>{
    expect(()=>selectPublishedFiveCharacterChatExecutorV1(
      {...binding('seyeon'),participantCharacterIds:['seyeon','rahyeon']},
      manifest('seyeon'),{seyeon:()=>true},
    )).toThrow(CharacterChatExecutorUnavailableV1);
    expect(()=>selectPublishedFiveCharacterChatExecutorV1(
      binding('baekheon'),manifest('seyeon'),{baekheon:()=>true},
    )).toThrow(CharacterChatExecutorUnavailableV1);
    expect(()=>selectPublishedFiveCharacterChatExecutorV1(
      {...binding('yeoul'),activeContentBundleId:'different'},
      manifest('yeoul'),{yeoul:()=>true},
    )).toThrow(CharacterChatExecutorUnavailableV1);
  });
});
