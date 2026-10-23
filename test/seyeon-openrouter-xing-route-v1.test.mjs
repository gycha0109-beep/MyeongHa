import {describe,it,expect,vi} from 'vitest';
import {chooseXingZdrSchemaRouteV1,getXingZdrSchemaRouteV1,XING_FREE_MODEL_V1} from '../scripts/seyeon-openrouter-xing-route-v1.mjs';
const good={model_id:XING_FREE_MODEL_V1,tag:'phala',pricing:{prompt:'0',completion:'0'},supported_parameters:['response_format']};
const detail={id:XING_FREE_MODEL_V1,endpoints:[{tag:'phala',pricing:{prompt:'0',completion:'0'},supported_parameters:['response_format'],status:0}]};
describe('Xing exact-ZDR schema free-only provider route',()=>{
 it('requires same free provider tag in official ZDR and model endpoint lists',()=>{
  expect(chooseXingZdrSchemaRouteV1([good],detail)).toBe('phala');
  expect(chooseXingZdrSchemaRouteV1([good],{...detail,endpoints:[{...detail.endpoints[0],tag:'other'}]})).toBeNull();
  expect(chooseXingZdrSchemaRouteV1([{...good,pricing:{prompt:'0.0001',completion:'0'}}],detail)).toBeNull();
  expect(chooseXingZdrSchemaRouteV1([good],{...detail,endpoints:[{...detail.endpoints[0],supported_parameters:[]}]})).toBeNull();
  expect(chooseXingZdrSchemaRouteV1([good,{...good,tag:'phala/other'}],
   {...detail,endpoints:[...detail.endpoints,{...detail.endpoints[0],tag:'phala/other'}]})).toBeNull();
 });
 it('never POSTs, and refuses a mismatched or missing metadata read',async()=>{
  const fetchImpl=vi.fn(async(url,init)=>{
   expect(init.method).toBe('GET');
   return Response.json({data:String(url).includes('/endpoints/zdr')?[good]:detail});
  });
  await expect(getXingZdrSchemaRouteV1('sk-or-long-synthetic-test-00000',fetchImpl)).resolves.toBe('phala');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await expect(getXingZdrSchemaRouteV1('sk-or-long-synthetic-test-00000',vi.fn(async()=>Response.json({error:'PRIVATE'}, {status:404})))).resolves.toBeNull();
 });
});
