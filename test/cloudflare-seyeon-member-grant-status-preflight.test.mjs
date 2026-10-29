import {describe,expect,it} from 'vitest';
import {handleCloudflareSeyeonMemberGrantStatusV1} from '../cloudflare/seyeon-member-grant-status.mjs';
const host='https://auth.synthetic-myeongha.dev';
const memory='a8100000-0000-4000-8000-000000000001';
const bindings={
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN:host,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST:'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT:'5432',
};
describe('Cloudflare SeYeon current Memory grant status preflight',()=>{
 it('rejects missing Stage5 authority before credential reads',async()=>{
   const proxy=new Proxy({...bindings,MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:undefined},{
     get(object,key){
       if(key==='MYEONGHA_DATABASE_URL'||key==='MYEONGHA_SUPABASE_API_KEY')
         throw new Error('CREDENTIALS_ACCESSED_WITHOUT_STAGE5');
       return object[key];
     },
   });
   const r=await handleCloudflareSeyeonMemberGrantStatusV1(
     new Request(host+'/api/memories/'+memory+'/grants/seyeon'),proxy);
   expect(r.status).toBe(404);
 });
 it('fails closed without valid DB and member verifier settings',async()=>{
   const r=await handleCloudflareSeyeonMemberGrantStatusV1(
     new Request(host+'/api/memories/'+memory+'/grants/seyeon'),bindings);
   expect(r.status).toBe(503);
   expect(r.headers.get('cache-control')).toBe('no-store');
   expect((await r.json()).error.code).toBe('GRANT_STATUS_UNAVAILABLE');
 });
 it('rejects query/body/unknown Memory identities',async()=>{
   for(const path of [
     '/api/memories/'+memory+'/grants/seyeon?cursor=x',
     '/api/memories/invalid/grants/seyeon',
     '/api/memories/'+memory+'/grants/seyeon/revoke',
   ]){
     const r=await handleCloudflareSeyeonMemberGrantStatusV1(new Request(host+path),bindings);
     expect(r.status).toBe(404);
   }
 });
});
