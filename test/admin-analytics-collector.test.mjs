import {describe,expect,it} from 'vitest';
import {initializeMyeonghaAnalyticsV1,mountMyeonghaAnalyticsConsentV1} from '../apps/web/admin-analytics-collector.js';
describe('disabled-by-default web analytics initialization',()=>{
  it('performs no request or storage access without approved policy and consent',async()=>{
    let calls=0;const collector=initializeMyeonghaAnalyticsV1({fetchImpl:async()=>{calls++;return new Response('{}');}});
    expect(collector.status).toBe('disabled');expect(collector.setConsent({granted:true})).toBe(false);
    expect(await collector.track('PAGE_VIEWED',{pageKey:'landing'})).toEqual({status:'disabled'});
    expect(await collector.withdraw()).toEqual({status:'local_consent_cleared'});expect(calls).toBe(0);
  });
  it('requires explicit server consent, preserves a retry envelope and withdraws after reload',async()=>{
    const sent=[];const policy={approved:true,approvalRef:'owner-20261027',policyVersion:'product-analytics-180d-v1',retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'test-admission-v1',approvedEvents:['PAGE_VIEWED']};
    const expiresAt=new Date(Date.now()+86400_000).toISOString();const fetchImpl=async(path,init)=>{sent.push({path,body:init.body,headers:init.headers});return path.endsWith('/consent')?Response.json({consent:{granted:true,visitorRef:'av_'+'a'.repeat(64),sessionRef:'as_'+'a'.repeat(64),version:'product-analytics-consent-180d-v1',expiresAt}}):path.endsWith('/session')?Response.json({visitorRef:'av_'+'a'.repeat(64),sessionRef:'as_'+'b'.repeat(64),version:'product-analytics-consent-180d-v1',expiresAt,sessionContext:'synthetic.signature'}):Response.json({});};
    const collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl});
    expect(await collector.track('PAGE_VIEWED',{pageKey:'product'})).toEqual({status:'consent_required'});expect(sent).toHaveLength(0);
    expect(await collector.grantConsent()).toEqual({status:'granted'});expect(JSON.parse(sent[0].body)).toEqual({decision:'grant'});
    const id='123e4567-e89b-42d3-a456-426614174000';await collector.track('PAGE_VIEWED',{pageKey:'product'},id);await collector.track('PAGE_VIEWED',{pageKey:'product'},id);
    expect(sent[2].body).toBe(sent[3].body);expect(sent[2].headers['X-MyeongHa-Analytics-Session']).toBe('synthetic.signature');expect(await collector.track('PAGE_VIEWED',{pageKey:'other'},id)).toMatchObject({status:'conflicting_event_id'});
    const reloaded=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl});expect(await reloaded.withdraw()).toEqual({status:'withdrawn'});
    expect(sent.at(-1).path).toBe('/api/analytics/withdraw');expect(mountMyeonghaAnalyticsConsentV1()).toBeNull();
  });
  it('restores an approved server-side consent only by explicit call, without a new grant',async()=>{
    const consent={granted:true,visitorRef:'av_'+'a'.repeat(64),
      version:'product-analytics-consent-180d-v1',expiresAt:new Date(Date.now()+86400_000).toISOString()};
    const sent=[];
    const policy={approved:true,approvalRef:'approved-test',policyVersion:'policy-v1',retentionSeconds:180*86400,
      deletionBindingVerified:true,validVisitPolicyVersion:'admitted-v1',approvedEvents:['PAGE_VIEWED']};
    const fetchImpl=async(path,options)=>{
      sent.push({path,options});
      if(path.endsWith('/consent'))return Response.json({code:'ANALYTICS_CONSENT_ACTIVE',consent});
      if(path.endsWith('/session'))return Response.json({visitorRef:consent.visitorRef,
        version:consent.version,expiresAt:consent.expiresAt,sessionRef:'as_'+'b'.repeat(64),
        sessionContext:'server-signed.context'});
      return Response.json({code:'ANALYTICS_RECORDED'});
    };
    const disabled=initializeMyeonghaAnalyticsV1({fetchImpl});
    expect(await disabled.restoreConsent()).toEqual({status:'disabled'});
    expect(sent).toHaveLength(0);
    const collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl});
    expect(sent).toHaveLength(0); // Import/construct never resumes tracking.
    expect(await collector.restoreConsent()).toEqual({status:'restored'});
    expect(sent.slice(0,2).map(x=>x.path)).toEqual(['/api/analytics/consent','/api/analytics/session']);
    expect(JSON.parse(sent[0].options.body)).toEqual({decision:'status'});
    expect(await collector.track('PAGE_VIEWED',{pageKey:'reading'})).toMatchObject({status:'recorded'});
    expect(sent).toHaveLength(3);
    expect(await collector.withdraw()).toEqual({status:'withdrawn'});
  });
  it('refuses expired/missing server consent without transmitting an event',async()=>{
    const policy={approved:true,approvalRef:'approved-test',policyVersion:'policy-v1',retentionSeconds:180*86400,
      deletionBindingVerified:true,validVisitPolicyVersion:'admitted-v1',approvedEvents:['PAGE_VIEWED']};
    let requests=0;
    const collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,
      fetchImpl:async()=>{requests++;return Response.json({code:'ANALYTICS_CONSENT_REQUIRED'},{status:403});}});
    expect(await collector.restoreConsent()).toEqual({status:'consent_required'});
    expect(requests).toBe(1);
    expect(await collector.track('PAGE_VIEWED',{pageKey:'reading'})).toEqual({status:'consent_required'});
    expect(requests).toBe(1);
  });
  it('uses consent-gated sessionStorage for a tab lifecycle rather than a 180-day cookie session',async()=>{
    let storageReads=0,sessions=0;const values=new Map();const memory={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const expiresAt=new Date(Date.now()+86400_000).toISOString(),visitorRef='av_'+'a'.repeat(64),version='product-analytics-consent-180d-v1';
    const policy={approved:true,approvalRef:'owner-20261027',policyVersion:'product-analytics-180d-v1',retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'test-admission-v1',approvedEvents:['PAGE_VIEWED']};
    const fetchImpl=async path=>path.endsWith('/consent')?Response.json({consent:{granted:true,visitorRef,version,expiresAt}}):Response.json({visitorRef,version,expiresAt,sessionRef:'as_'+String(++sessions).repeat(64),sessionContext:'synthetic.signature'});
    const options={enabled:true,policy,fetchImpl,get sessionStorage(){storageReads++;return memory;}};
    const first=initializeMyeonghaAnalyticsV1(options);expect(await first.startSession()).toEqual({status:'consent_required'});expect(storageReads).toBe(0);
    await first.grantConsent();expect(sessions).toBe(1);expect(storageReads).toBeGreaterThan(0);
    const sameTab=initializeMyeonghaAnalyticsV1(options);await sameTab.grantConsent();expect(sessions).toBe(1);
    const otherTab=initializeMyeonghaAnalyticsV1({...options,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}});await otherTab.grantConsent();expect(sessions).toBe(2);
  });
  it('offers explicit server withdrawal even after collection is disabled, without re-enabling tracking',async()=>{
    const requests=[],nodes=[];
    const doc={createElement(tag){return{tag,children:[],listeners:{},
      setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},append(...items){this.children.push(...items);}}},
      body:{append(node){nodes.push(node);}}};
    const opts={enabled:false,withdrawalAvailable:true,documentImpl:doc,
      fetchImpl:async(path,options)=>{requests.push({path,options});return Response.json({code:'ANALYTICS_WITHDRAWN'});}};
    const collector=mountMyeonghaAnalyticsConsentV1(opts);
    expect(collector.status).toBe('disabled');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children.filter(node=>node.tag==='button').map(node=>node.textContent)).toEqual(['분석 동의 철회']);
    expect(requests).toHaveLength(0);
    expect(await collector.track('PAGE_VIEWED',{pageKey:'product'})).toEqual({status:'disabled'});
    expect(await collector.grantConsent()).toEqual({status:'disabled'});
    expect(requests).toHaveLength(0);
    expect(await collector.withdraw()).toEqual({status:'withdrawn'});
    expect(requests.map(item=>item.path)).toEqual(['/api/analytics/withdraw']);
    expect(requests[0].options).toMatchObject({method:'POST',credentials:'same-origin',cache:'no-store'});
    expect(mountMyeonghaAnalyticsConsentV1({documentImpl:doc})).toBeNull();
  });
  it('does not resume collection when a pending grant returns after withdrawal',async()=>{
    let finish;const pending=new Promise(resolve=>{finish=resolve;});const sent=[];
    const policy={approved:true,approvalRef:'owner-20261027',policyVersion:'product-analytics-180d-v1',retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'test-admission-v1',approvedEvents:['PAGE_VIEWED']};
    const collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl:async path=>{sent.push(path);return path.endsWith('/consent')?pending:Response.json({});}});
    const grant=collector.grantConsent();await collector.withdraw();finish(Response.json({consent:{granted:true,visitorRef:'av_'+'a'.repeat(64),version:'product-analytics-consent-180d-v1',expiresAt:new Date(Date.now()+86400_000).toISOString()}}));
    expect(await grant).toEqual({status:'cancelled'});expect(await collector.track('PAGE_VIEWED',{pageKey:'product'})).toEqual({status:'consent_required'});expect(sent).toHaveLength(2);
  });
});
