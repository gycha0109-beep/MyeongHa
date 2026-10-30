import {describe,it,expect} from 'vitest';
import {createAdminSupabaseOwnerAuthV1} from './admin-auth-v1.js';
const OWNER='123e4567-e89b-42d3-a456-426614174000';
const OTHER='123e4567-e89b-42d3-a456-426614174001';
const request=()=>new Request('https://admin.test/api/admin/session',{headers:{Authorization:'Bearer synthetic.test.signature'}});
describe('same-response Owner UUID and email binding',()=>{
 const create=(user:unknown)=>createAdminSupabaseOwnerAuthV1({ownerAuthUserId:OWNER,ownerEmail:'owner@example.test',supabaseOrigin:'https://project.supabase.co',supabaseApiKey:'synthetic-public-key-test-only',fetchImpl:async()=>Response.json(user)});
 it('requires both identifiers from verified provider evidence',async()=>{
  expect(await create({id:OWNER,email:'OWNER@example.test'}).verifyOwner(request())).toEqual({authUserId:OWNER});
  for(const user of [{id:OWNER,email:'other@example.test'},{id:OTHER,email:'owner@example.test'},{id:OWNER},{email:'owner@example.test'}]){
   if(!('id' in user))await expect(create(user).verifyOwner(request())).rejects.toThrow();
   else expect(await create(user).verifyOwner(request())).toBeNull();
  }
 });
 it('does not use a browser-supplied identity and rejects absent credentials',async()=>{
  const auth=create({id:OWNER,email:'other@example.test'});
  expect(await auth.verifyOwner(new Request('https://admin.test/api/admin/session',{headers:{Authorization:'Bearer synthetic.test.signature','X-Owner-Email':'owner@example.test'}}))).toBeNull();
  expect(await auth.verifyOwner(new Request('https://admin.test/api/admin/session'))).toBeNull();
 });
});
