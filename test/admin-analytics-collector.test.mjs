import {describe,expect,it} from 'vitest';
import {initializeMyeonghaAnalyticsV1} from '../apps/web/admin-analytics-collector.js';
describe('disabled-by-default web analytics initialization',()=>{
  it('performs no request or storage access without approved policy and consent',async()=>{
    let calls=0;const collector=initializeMyeonghaAnalyticsV1({fetchImpl:async()=>{calls++;return new Response('{}');}});
    expect(collector.status).toBe('disabled');expect(collector.setConsent({granted:true})).toBe(false);
    expect(await collector.track('PAGE_VIEWED',{pageKey:'landing'})).toEqual({status:'disabled'});
    expect(await collector.withdraw()).toEqual({status:'local_consent_cleared'});expect(calls).toBe(0);
  });
});
