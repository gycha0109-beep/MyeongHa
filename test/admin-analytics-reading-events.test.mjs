import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {bindApprovedReadingResultViewV1,installApprovedReadingAnalyticsV1,readingAnalytics,OFFICIAL_READING_RENDERED_EVENT_V1} from '../apps/web/admin-analytics-reading-events.js';

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
  it('installs only an explicitly approved collector and tracks only a post-consent official view',async()=>{
    const doc=new EventTarget(),sections=[];
    doc.createElement=tag=>({tag,textContent:'',children:[],setAttribute(){},
      addEventListener(){},append(...children){this.children.push(...children);}});
    doc.body={append:node=>sections.push(node)};
    expect(installApprovedReadingAnalyticsV1({documentImpl:doc})).toBeNull();
    const requests=[],expiresAt=new Date(Date.now()+86400_000).toISOString();
    const visitorRef='av_'+'a'.repeat(64),sessionRef='as_'+'b'.repeat(64);
    const policy={approved:true,approvalRef:'approval-v1',policyVersion:'policy-v1',
      retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'valid-v1',
      approvedEvents:['RESULT_VIEWED']};
    const collector=installApprovedReadingAnalyticsV1({
      enabled:true,policy,documentImpl:doc,
      fetchImpl:async(path,options)=>{
        requests.push({path,options});
        if(path.endsWith('/consent'))return Response.json({consent:{granted:true,visitorRef,version:'consent-v1',expiresAt}});
        if(path.endsWith('/session'))return Response.json({visitorRef,sessionRef,version:'consent-v1',expiresAt,
          sessionContext:'signed.session'});
        return Response.json({code:'ANALYTICS_RECORDED'});
      },
    });
    expect(collector).not.toBeNull();
    doc.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
    expect(requests).toHaveLength(0);
    expect(await collector.collector.grantConsent()).toMatchObject({status:'granted'});
    doc.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
    const sent=requests.filter(x=>x.path==='/api/analytics/events');
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].options.body)).toMatchObject({
      eventName:'RESULT_VIEWED',payload:{pageKey:'official_reading'},client:'web',
    });
    collector.dispose();
    doc.dispatchEvent(new Event(OFFICIAL_READING_RENDERED_EVENT_V1));
    expect(requests.filter(x=>x.path==='/api/analytics/events')).toHaveLength(1);
  });
  it('emits its source signal only after persisted Official Reading is rendered, not preview',()=>{
    const source=readFileSync(new URL('../apps/web/reading-character.js',import.meta.url),'utf8');
    expect(source).toMatch(/if \(isStoredRecord && stage\?\.hidden === false\)\s*\{\s*document\.dispatchEvent\(new Event\('myeongha:official-reading-rendered'\)\)/u);
    expect(source.indexOf("document.dispatchEvent(new Event('myeongha:official-reading-rendered'))"))
      .toBeGreaterThan(source.indexOf('renderStep();'));
  });
});
