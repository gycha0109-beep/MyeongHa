import {describe,it,expect} from 'vitest';
import {createAdminCommandHttpHandlerV1} from './admin-command-http-v1.js';
import {parseAdminCommandInputV1} from './admin-command-contract-v1.js';
import type {AdminCommandBindingV1,AdminCommandResultV1} from './admin-command-contract-v1.js';

const OWNER='123e4567-e89b-42d3-a456-426614174000';
const ENTRY='123e4567-e89b-42d3-a456-426614174001';
const OP='123e4567-e89b-42d3-a456-426614174002';
const INPUT={operation:'presentation-save',operationId:OP,targetRef:ENTRY,reason:'운영 공지 갱신',parameters:{expectedRevision:0,kind:'notice',title:'테스트 공지',body:'표현 정보',linkPath:'/hall.html',status:'draft',startsAt:null,endsAt:null}};
function harness(options:{owner?:boolean;auditFails?:boolean;binding?:boolean;throwsExecute?:boolean}={}){
 let now=new Date('2026-10-27T00:00:00Z');let executions=0;const audits:unknown[]=[];const receipts=new Map<string,AdminCommandResultV1>();
 const binding:AdminCommandBindingV1={operation:'presentation-save',authority:'test-only-presentation-domain',
  async preview(){return{before:{entryId:ENTRY,revision:0},expectedVersion:'0'};},
  async execute(context){if(options.throwsExecute)throw new Error('private database detail');const prior=receipts.get(context.input.operationId);if(prior)return{...prior,status:'replayed'};executions++;const value:AdminCommandResultV1={operationId:context.input.operationId,targetRef:ENTRY,status:'succeeded',state:{entryId:ENTRY,revision:1}};receipts.set(context.input.operationId,value);return value;},
  async findResult(_actor,id){return receipts.get(id)??null;},
 };
 const handle=createAdminCommandHttpHandlerV1({auth:{async verifyOwner(){return options.owner===false?null:{authUserId:OWNER};}},audit:{async append(event){if(options.auditFails)throw new Error('audit unavailable');audits.push(event);}},commands:{bindings:options.binding===false?[]:[binding]},allowedOrigin:'https://admin.example.test',now:()=>now});
 return{handle,audits,get executions(){return executions;},advance(){now=new Date(now.getTime()+300_001);},post(path:string,body:unknown,origin='https://admin.example.test'){return handle(new Request('https://admin.example.test'+path,{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}));}};
}
async function preview(h:ReturnType<typeof harness>){const response=await h.post('/api/admin/commands/preview',INPUT);expect(response.status).toBe(200);return await response.json() as {confirmationToken:string};}
describe('Owner command preview and durable execution boundary',()=>{
 it('requires explicit provider and domain support for each refund mode even when a refund binding exists',async()=>{
  let previews=0;
  const binding:AdminCommandBindingV1={operation:'refund',authority:'test-domain',async preview(){previews++;return{before:{},expectedVersion:'1'};},async execute(){throw Error('Never refund in a test');},async findResult(){return null;}};
  const handler=createAdminCommandHttpHandlerV1({auth:{async verifyOwner(){return{authUserId:OWNER};}},audit:{async append(){}},commands:{bindings:[binding],refundSupport:{full:true,partial:false,authority:'test-existing-provider-contract'}},allowedOrigin:'https://admin.example.test'});
  const post=(mode:string)=>handler(new Request('https://admin.example.test/api/admin/commands/preview',{method:'POST',headers:{Origin:'https://admin.example.test','Content-Type':'application/json'},body:JSON.stringify({...INPUT,operation:'refund',parameters:{mode,amountMinor:100}})}));
  expect((await post('partial')).status).toBe(409);expect(previews).toBe(0);expect((await post('full')).status).toBe(200);expect(previews).toBe(1);
 });
 it('validates signed confirmation across separate Worker handler instances',async()=>{
  let executions=0;
  const binding:AdminCommandBindingV1={operation:'presentation-save',authority:'synthetic-test-binding',
    async preview(){return{before:{revision:0},expectedVersion:'0'};},
    async execute(_context,version){expect(version).toBe('0');executions++;return{operationId:OP,targetRef:ENTRY,status:'succeeded',state:{revision:1}};},
    async findResult(){return null;}};
  const handler=()=>createAdminCommandHttpHandlerV1({auth:{async verifyOwner(){return{authUserId:OWNER};}},audit:{async append(){}},
    commands:{bindings:[binding]},allowedOrigin:'https://admin.example.test',confirmationSigningSecret:'synthetic-test-signing-key-32-bytes',now:()=>new Date('2026-10-27T00:00:00Z')});
  const request=(path:string,body:unknown)=>new Request('https://admin.example.test/api/admin/commands/'+path,{method:'POST',
    headers:{'Content-Type':'application/json',Origin:'https://admin.example.test'},body:JSON.stringify(body)});
  const previewResponse=await handler()(request('preview',INPUT));
  const issued=await previewResponse.json() as {confirmationToken:string};
  expect((await handler()(request('execute',{input:INPUT,confirmationToken:issued.confirmationToken}))).status).toBe(200);
  expect(executions).toBe(1);
  expect((await handler()(request('execute',{input:{...INPUT,reason:'changed'},confirmationToken:issued.confirmationToken}))).status).toBe(409);
  expect((await handler()(request('execute',{input:INPUT,confirmationToken:issued.confirmationToken+'a'}))).status).toBe(409);
  expect(executions).toBe(1);
 });
 it('keeps missing domain commands disabled and denies non-Owner before preview',async()=>{
  const denied=harness({owner:false});expect((await denied.post('/api/admin/commands/preview',INPUT)).status).toBe(403);expect(denied.executions).toBe(0);
  const h=harness({binding:false});const caps=await h.handle(new Request('https://admin.example.test/api/admin/commands/capabilities'));expect((await caps.json() as {capabilities:{enabled:boolean}[]}).capabilities.every(x=>!x.enabled)).toBe(true);
  expect((await h.post('/api/admin/commands/preview',INPUT)).status).toBe(409);expect(h.executions).toBe(0);
 });
 it('requires exact origin and actor/payload-bound confirmation and rejects altered reasons',async()=>{
  const h=harness();expect((await h.post('/api/admin/commands/preview',INPUT,'https://evil.example')).status).toBe(400);
  const p=await preview(h);expect(h.executions).toBe(0);
  expect((await h.post('/api/admin/commands/execute',{input:INPUT,confirmationToken:'invalid'})).status).toBe(409);
  expect((await h.post('/api/admin/commands/execute',{input:{...INPUT,reason:'변경된 사유'},confirmationToken:p.confirmationToken})).status).toBe(409);
  expect(h.executions).toBe(0);
 });
 it('executes once, supports same-key replay, and reads the durable result independently',async()=>{
  const h=harness();const p=await preview(h);const payload={input:INPUT,confirmationToken:p.confirmationToken};
  expect((await h.post('/api/admin/commands/execute',payload)).status).toBe(200);
  const replay=await h.post('/api/admin/commands/execute',payload);expect((await replay.json() as {status:string}).status).toBe('replayed');expect(h.executions).toBe(1);
  const lookup=await h.handle(new Request('https://admin.example.test/api/admin/commands/result?operation=presentation-save&operationId='+OP));expect((await lookup.json() as {state:{revision:number}}).state.revision).toBe(1);
 });
 it('expires previews without executing and refuses effects when audit storage fails',async()=>{
  const h=harness();const p=await preview(h);h.advance();expect((await h.post('/api/admin/commands/execute',{input:INPUT,confirmationToken:p.confirmationToken})).status).toBe(409);expect(h.executions).toBe(0);
  const audit=harness({auditFails:true});expect((await audit.post('/api/admin/commands/preview',INPUT)).status).toBe(503);expect(audit.executions).toBe(0);
 });
 it('does not claim success after an uncertain command failure or expose error details',async()=>{
  const h=harness({throwsExecute:true});const p=await preview(h);const response=await h.post('/api/admin/commands/execute',{input:INPUT,confirmationToken:p.confirmationToken});expect(response.status).toBe(503);const text=await response.text();expect(text).toContain('ADMIN_COMMAND_RESULT_UNCERTAIN');expect(text).not.toContain('private database detail');expect(h.audits).toContainEqual(expect.objectContaining({action:'command:execute-uncertain',outcome:'failed'}));
 });
 it('rejects table-shaped fields, HTML redirect paths, unsafe amounts and malformed schedules',()=>{
  for(const input of [{...INPUT,table:'subjects'},{...INPUT,parameters:{...INPUT.parameters,linkPath:'//evil.test'}},{...INPUT,parameters:{...INPUT.parameters,startsAt:'2026-10-28T00:00:00Z',endsAt:'2026-10-27T00:00:00Z'}},{...INPUT,operation:'credit-adjust',parameters:{delta:0}},{...INPUT,operation:'refund',parameters:{mode:'partial',amountMinor:-1}}])expect(()=>parseAdminCommandInputV1(input)).toThrow();
  expect(parseAdminCommandInputV1({...INPUT,operation:'credit-adjust',parameters:{delta:-10}}).parameters.delta).toBe(-10);
 });
});
