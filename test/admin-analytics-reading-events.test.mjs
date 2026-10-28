import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {bindApprovedReadingResultViewV1,readingAnalytics,OFFICIAL_READING_RENDERED_EVENT_V1} from '../apps/web/admin-analytics-reading-events.js';

describe('official Reading results opt-in view observation',()=>{
  it('keeps the public module inactive without server approval or consent',()=>{
    const target=new EventTarget();
    expect(readingAnalytics.status).toBe('disabled');
    expect(bindApprovedReadingResultViewV1({collector:readingAnalytics,documentImpl:target})).toBeNull();
    target.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
  });
  it('captures only the approved persisted result presentation signal and supports detach',async()=>{
    const target=new EventTarget(),events=[];
    const dispose=bindApprovedReadingResultViewV1({collector:{status:'awaiting_consent',
      async track(eventName,payload){events.push([eventName,payload]);return {status:'recorded'};}},documentImpl:target});
    target.dispatchEvent(new Event('myeongha:preview-reading-rendered'));
    expect(events).toHaveLength(0);
    target.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
    expect(events).toEqual([['RESULT_VIEWED',{pageKey:'official_reading'}]]);
    expect(JSON.stringify(events)).not.toMatch(/birth|token|readingId|purchaseRef|inputHash/iu);
    dispose();
    target.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
    expect(events).toHaveLength(1);
  });
  it('emits its source signal only after persisted Official Reading is rendered, not preview',()=>{
    const source=readFileSync(new URL('../apps/web/reading-character.js',import.meta.url),'utf8');
    expect(source).toMatch(/if \(isStoredRecord && stage\?\.hidden === false\)\s*\{\s*document\.dispatchEvent\(new Event\('myeongha:official-reading-rendered'\)\)/u);
    expect(source.indexOf("document.dispatchEvent(new Event('myeongha:official-reading-rendered'))"))
      .toBeGreaterThan(source.indexOf('renderStep();'));
  });
});
