import {createHash} from 'node:crypto';
import type {AdminAiBudgetWindowV1} from './admin-ai-budget-v1.js';

export const OPENAI_ORGANIZATION_COSTS_ENDPOINT_V1 =
  'https://api.openai.com/v1/organization/costs' as const;

export interface OpenAiCostsObservationV1 {
  readonly version: 'openai-organization-costs-observation-v1';
  readonly provider: 'openai';
  readonly scope: 'project_all_line_items';
  readonly projectId: string;
  readonly queriedFrom: string;
  readonly queriedToExclusive: string;
  readonly observedMicroUsd: string;
  readonly sourceSha256: string;
  readonly pageCount: number;
  readonly billingStatus: 'provider_reported_not_final_invoice';
  readonly invoiceConfirmed: false;
}

interface AdminCostsResponseV1 {
  readonly data: readonly unknown[];
  readonly has_more: boolean;
  readonly next_page: string | null;
}

function object(value:unknown):Record<string,unknown> {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Invalid OpenAI costs response');
  return value as Record<string,unknown>;
}
function epoch(value:string):number {
  const d=Date.parse(value);
  if(!Number.isFinite(d)||!value.endsWith('Z'))throw Error('Invalid OpenAI cost query window');
  return Math.floor(d/1000);
}
function nonnegativeMicroUsd(value:unknown):bigint {
  // Provider monetary values are JSON numbers. Never claim sub-micro-USD
  // precision; a billed invoice is still required for confirmed accounting.
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||
     !Number.isSafeInteger(Math.round(value*1_000_000)))throw Error('Invalid OpenAI reported cost');
  return BigInt(Math.round(value*1_000_000));
}
function page(value:unknown):AdminCostsResponseV1 {
  const row=object(value);
  if(row.object!=='page'||!Array.isArray(row.data)||typeof row.has_more!=='boolean'||
     !(row.next_page===null||typeof row.next_page==='string'))throw Error('Invalid OpenAI costs page');
  return row as unknown as AdminCostsResponseV1;
}

/**
 * Read-only, opt-in upstream costs observation. Uses an injected secret server
 * credential with OpenAI Admin API access and a fixed project filter.
 * This endpoint reports organization/project costs across all line items,
 * including potentially non-model charges. It is NOT a final invoice and
 * cannot assert exact per-call attribution or a confirmed monthly AI budget.
 * No credentials, data, or requests are sent until read() is invoked.
 */
export function createOpenAiAdminCostsReaderV1(input:{
  readonly adminKey:string;
  readonly projectId:string;
  readonly fetchImpl?:typeof fetch;
}) {
  if(typeof input.adminKey!=='string'||input.adminKey.length<24||
    /[\r\n\u0000-\u001f]/u.test(input.adminKey)||
    !/^proj_[A-Za-z0-9_-]{4,128}$/u.test(input.projectId))
    throw Error('OpenAI Admin costs configuration unavailable');
  const secret=input.adminKey;
  const projectId=input.projectId;
  const send=input.fetchImpl??fetch;
  return Object.freeze({
    async read(window:AdminAiBudgetWindowV1):Promise<OpenAiCostsObservationV1|undefined>{
      const from=epoch(window.from),until=Math.min(epoch(window.toExclusive),epoch(window.observedThrough));
      if(until<=from)return undefined;
      if(until-from>32*86_400)throw Error('Unbounded OpenAI costs period');
      const hash=createHash('sha256');
      const seenPages=new Set<string>(),seenBuckets=new Set<string>();
      let cursor:string|null=null,more=true,total=0n,pageCount=0;
      while(more){
        if(pageCount>=10)throw Error('Incomplete OpenAI costs pagination');
        const params=new URLSearchParams({
          start_time:String(from),end_time:String(until),bucket_width:'1d',
          limit:'180', 'project_ids[]':projectId,
        });
        if(cursor!==null)params.set('page',cursor);
        const url=OPENAI_ORGANIZATION_COSTS_ENDPOINT_V1+'?'+params.toString();
        const response=await send(url,{method:'GET',redirect:'error',headers:{
          Authorization:'Bearer '+secret,Accept:'application/json',
        }});
        if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
          throw Error('OpenAI costs source unavailable');
        const raw=await response.text();
        if(raw.length>1024*1024)throw Error('Oversized OpenAI costs source');
        hash.update(String(raw.length)).update(':').update(raw).update(';');
        const parsed=page(JSON.parse(raw));pageCount++;
        for(const entry of parsed.data){
          const bucket=object(entry);
          if(bucket.object!=='bucket'||!Number.isSafeInteger(bucket.start_time)||
            !Number.isSafeInteger(bucket.end_time)||
            (bucket.end_time as number)<= (bucket.start_time as number)||
            (bucket.end_time as number)<=from||(bucket.start_time as number)>=until||
            !Array.isArray(bucket.results))throw Error('Invalid OpenAI cost bucket');
          const bucketKey=String(bucket.start_time)+':'+String(bucket.end_time);
          if(seenBuckets.has(bucketKey))throw Error('Duplicate OpenAI cost bucket');
          seenBuckets.add(bucketKey);
          for(const item of bucket.results){
            const cost=object(item);
            if(cost.object!=='organization.costs.result'||(cost.project_id!=null&&cost.project_id!==projectId))
              throw Error('Cross-project or unknown OpenAI cost result');
            const amount=object(cost.amount);
            if(amount.currency!=='usd')throw Error('Non-USD OpenAI costs result');
            total+=nonnegativeMicroUsd(amount.value);
          }
        }
        more=parsed.has_more;
        if(more){
          if(!parsed.next_page||parsed.next_page.length>256||seenPages.has(parsed.next_page))
            throw Error('Invalid OpenAI costs pagination cursor');
          seenPages.add(parsed.next_page);cursor=parsed.next_page;
        }else if(parsed.next_page!==null)throw Error('Unexpected OpenAI costs pagination cursor');
      }
      return Object.freeze({
        version:'openai-organization-costs-observation-v1' as const,
        provider:'openai' as const,scope:'project_all_line_items' as const,
        projectId,queriedFrom:new Date(from*1000).toISOString(),
        queriedToExclusive:new Date(until*1000).toISOString(),
        observedMicroUsd:total.toString(),sourceSha256:hash.digest('hex'),
        pageCount,billingStatus:'provider_reported_not_final_invoice' as const,invoiceConfirmed:false as const,
      });
    },
  });
}
