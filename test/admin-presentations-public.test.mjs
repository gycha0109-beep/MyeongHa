import {describe,it,expect} from 'vitest';
import {handleCloudflarePresentationFeedV1,PUBLIC_PRESENTATION_PATH_V1} from '../workers/cloudflare-presentation-feed.mjs';
import mainWorker from '../cloudflare/myeongha-worker.mjs';
import {createPublicPresentationReaderV1} from '../apps/api/src/admin-presentation-public-v1.ts';
import {loadPublishedPresentationsV1} from '../apps/web/admin-operations-public.js';

describe('public expression projection',()=>{
 it('keeps the feed disabled before opening a database or fetching assets',async()=>{
  let touched=0;
  const request=new Request('https://myeongha.gycha0109.workers.dev'+PUBLIC_PRESENTATION_PATH_V1);
  expect((await handleCloudflarePresentationFeedV1(request,{}, {createPool(){touched++;throw Error('unexpected');}})).status).toBe(404);
  expect((await mainWorker.fetch(request,{ASSETS:{fetch(){touched++;}}},{})).status).toBe(404);
  expect(touched).toBe(0);
 });
 it('sets the fixed execution role and projects only public presentation fields',async()=>{
  const sql=[];const entry={entryId:'123e4567-e89b-42d3-a456-426614174000',revision:1,kind:'notice',title:'Notice',body:'Plain text',linkPath:'/hall.html',reason:'private',actorAuthUserId:'private'};
  const read=createPublicPresentationReaderV1({async connect(){return {async query(query){sql.push(query);return {rows:query.startsWith('SELECT')?[{entry}]:[]};},release(){}};}});
  const rows=await read();expect(sql[1]).toBe('SET LOCAL ROLE myeongha_api_executor');
  expect(sql.at(-1)).toBe('COMMIT');expect(rows[0]).not.toHaveProperty('reason');expect(rows[0]).not.toHaveProperty('actorAuthUserId');
 });
 it('renders text as text and drops external links',async()=>{
  const node=tag=>({tag,children:[],textContent:'',setAttribute(){},append(...items){this.children.push(...items);},get childElementCount(){return this.children.length;}});
  const body=node('body');const doc={body,createElement:node};
  await loadPublishedPresentationsV1({documentImpl:doc,fetchImpl:async()=>Response.json({version:'public-presentations-v1',entries:[{kind:'notice',title:'<script>alert(1)</script>',body:'<img onerror=alert(1)>',linkPath:'//evil.test'}]})});
  const article=body.children[0].children[0];expect(article.children).toHaveLength(2);expect(article.children[0].textContent).toContain('<script>');
  expect(article.children[1].textContent).toContain('<img');
 });
});
