// Watchtower-Track: security
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {
  buildSeyeonG1HistoricalModelWindowCensusV1,
  SeyeonG1HistoricalModelWindowHoldV1,
} from '../apps/api/src/seyeon-g1-historical-model-window-census-v1.js';

const dbRows=[
  {messageId:'old-user',sequenceNo:1,senderType:'user',characterId:null,text:'synthetic older User',createdAt:'2026-10-01T00:00:00Z'},
  {messageId:'old-assistant',sequenceNo:2,senderType:'character',characterId:'seyeon',text:'synthetic older Assistant',createdAt:'2026-10-01T00:00:01Z'},
  {messageId:'current-user',sequenceNo:3,senderType:'user',characterId:null,text:'synthetic live Turn',createdAt:'2026-10-01T00:00:02Z'},
];
const context=[
  {messageId:'old-user',role:'user' as const,text:'synthetic older User'},
  {messageId:'old-assistant',role:'assistant' as const,text:'synthetic older Assistant'},
  {messageId:'current-user',role:'user' as const,text:'synthetic live Turn'},
];
const base={
  currentUserMessageId:'current-user',
  currentUserText:'synthetic live Turn',
  maxRecentMessages:12,
  dbVerifiedWindow:dbRows,
  exactModelRecentMessages:context,
};

describe('S0 G0->G1 exact historical model-input window (offline HOLD)',()=>{
  it('assembles a complete source digest without ever authorizing an AI model',()=>{
    const value=buildSeyeonG1HistoricalModelWindowCensusV1(base);
    expect(value.historicalSourceCount).toBe(2);
    expect(value.selectedHistoricalModelSourceDigest).toMatch(/^sha256:v1:[a-f0-9]{64}$/);
    expect(value.selectedCompleteModelWindowDigest).not.toBe(value.selectedHistoricalModelSourceDigest);
    expect(value.persistedBeforeModel).toBe(false);
    expect(value.authorizesModel).toBe(false);
    expect(value.permitsHttpReveal).toBe(false);
  });

  it.each([
    ['dropped earlier source',{...base,dbVerifiedWindow:[dbRows[1]!,dbRows[2]!]}],
    ['extra unknown original source',{...base,dbVerifiedWindow:[dbRows[0]!,dbRows[0]!,dbRows[1]!,dbRows[2]!]}],
    ['changed private history',{...base,dbVerifiedWindow:[dbRows[0]!,{...dbRows[1]!,text:'modified'},dbRows[2]!]}],
    ['wrong historic Character',{...base,dbVerifiedWindow:[dbRows[0]!,{...dbRows[1]!,characterId:'other'},dbRows[2]!]}],
    ['unknown original type',{...base,dbVerifiedWindow:[dbRows[0]!,{...dbRows[1]!,senderType:'system'},dbRows[2]!]}],
    ['wrong old Sender',{...base,exactModelRecentMessages:[context[0]!,{...context[1]!,role:'user' as const},context[2]!]}],
    ['injected extra model message',{...base,exactModelRecentMessages:[context[0]!,context[1]!,context[1]!,context[2]!]}],
    ['reordered originals',{...base,dbVerifiedWindow:[dbRows[1]!,dbRows[0]!,dbRows[2]!]}],
    ['wrong current User',{...base,dbVerifiedWindow:[dbRows[0]!,dbRows[1]!,{...dbRows[2]!,text:'forged'}]}],
    ['replayed old User as current',{...base,currentUserMessageId:'old-user'}],
    ['invalid truncated window cap',{...base,maxRecentMessages:2}],
    ['empty history',{...base,dbVerifiedWindow:[dbRows[2]!],exactModelRecentMessages:[context[2]!]}],
  ] as const)('rejects %s before candidate source admission',(_name,input)=>{
    expect(()=>buildSeyeonG1HistoricalModelWindowCensusV1(input))
      .toThrow(SeyeonG1HistoricalModelWindowHoldV1);
  });

  it('integrates original G0 source re-read in the real production planner, yet never calls the model',()=>{
    const exec=readFileSync(new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts',import.meta.url),'utf8');
    const reread=exec.indexOf('const dbVerifiedWindow=await input.contextReadPort.readRecentMessages({');
    const assertion=exec.indexOf('buildSeyeonG1HistoricalModelWindowCensusV1({');
    const hold=exec.indexOf("'Se-yeon historical model sources need an immutable G1 DB Pin before Provider.'");
    const actualPin=exec.indexOf('await input.positivePersonalSourcePort.pinBeforeModel({');
    expect(reread).toBeGreaterThan(0);
    expect(reread).toBeLessThan(assertion);
    expect(assertion).toBeLessThan(hold);
    expect(hold).toBeLessThan(actualPin);
  });
});
