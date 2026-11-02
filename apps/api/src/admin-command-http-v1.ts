import { createHash, randomUUID } from 'node:crypto';
import { createAdminCommandConfirmationV1 } from './admin-command-confirmation-v1.js';
import type { AdminAuthPortV1 } from './admin-auth-v1.js';
import type { AdminAuditPortV1 } from './admin-read-http-v1.js';
import { ADMIN_COMMAND_KEYS_V1, ADMIN_COMMAND_BLOCKERS_V1, parseAdminCommandInputV1, requireAdminCommandStateV1 } from './admin-command-contract-v1.js';
import type { AdminCommandBindingV1, AdminCommandContextV1, AdminCommandKeyV1, AdminCommandPreviewV1, AdminCommandResultV1, AdminCommandServicesV1 } from './admin-command-contract-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function json(status: number, requestId: string, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Request-Id':requestId,'Vary':'Authorization' } });
}
function result(value: AdminCommandResultV1, operationId: string) {
  if (value.operationId !== operationId || !UUID.test(value.targetRef) || !['succeeded','replayed','pending','partial','failed'].includes(value.status)) throw new Error('Invalid command result.');
  return Object.freeze({ ...value, state: requireAdminCommandStateV1(value.state) });
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length') ?? '0') > 16_384) throw new Error('Invalid command body.');
  if (request.body === null) throw new Error('Missing command body.');
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 16_384) { await reader.cancel(); throw new Error('Command too large.'); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)) as unknown;
}

/** Unmounted until an independent private host supplies explicit domain bindings.
 * Preview is read-only; execute requires a short-lived payload/actor-bound nonce.
 * Approved bindings own durable receipts and atomic domain+reason+audit writes. */
export function createAdminCommandHttpHandlerV1(deps: {
  readonly auth: AdminAuthPortV1; readonly audit: AdminAuditPortV1;
  readonly commands?: AdminCommandServicesV1;
  readonly allowedOrigin?: string; readonly now?: () => Date;
  readonly confirmationSigningSecret?: string;
}) {
  const signing = deps.confirmationSigningSecret === undefined ? undefined : createAdminCommandConfirmationV1(deps.confirmationSigningSecret);
  const bindings = new Map<AdminCommandKeyV1,AdminCommandBindingV1>();
  for (const binding of deps.commands?.bindings ?? []) {
    if (bindings.has(binding.operation) || !ADMIN_COMMAND_KEYS_V1.includes(binding.operation) || !binding.authority.trim()) throw new Error('Invalid command binding.');
    bindings.set(binding.operation,binding);
  }
  const confirmations = new Map<string,{ context: AdminCommandContextV1; preview: AdminCommandPreviewV1; expiresAt: number; running: boolean }>();
  let inflight = false;
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID(); const now = (deps.now ?? (() => new Date()))();
    const append = async (actor: string|null, action: string, outcome: 'allowed'|'denied'|'failed', targetRef: string|null = null) => deps.audit.append({ requestId,actorAuthUserId:actor,action,outcome,targetRef,at:now.toISOString() });
    let actor: { authUserId: string } | null;
    try { actor = await deps.auth.verifyOwner(request); } catch { try{await append(null,'command:auth','failed');}catch{return json(503,requestId,{error:'ADMIN_AUDIT_UNAVAILABLE'});}return json(503,requestId,{error:'ADMIN_AUTH_UNAVAILABLE'}); }
    if (actor === null) { try { await append(null,'command:access','denied'); } catch { return json(503,requestId,{error:'ADMIN_AUDIT_UNAVAILABLE'}); } return json(403,requestId,{error:'ADMIN_FORBIDDEN'}); }
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/admin/commands/capabilities' && url.search === '') {
        await append(actor.authUserId,'command:capabilities','allowed');
        return json(200,requestId,{ capabilities: ADMIN_COMMAND_KEYS_V1.map(operation => {
          const refundModes={full:bindings.has('refund')&&deps.commands?.refundSupport?.full===true,partial:bindings.has('refund')&&deps.commands?.refundSupport?.partial===true};
          const enabled=bindings.has(operation)&&deps.allowedOrigin!==undefined&&(operation!=='refund'||refundModes.full||refundModes.partial);
          return {operation,enabled,authority:bindings.get(operation)?.authority??null,blocker:enabled?null:ADMIN_COMMAND_BLOCKERS_V1[operation],...(operation==='refund'?{refundModes}:{})};
        }) });
      }
      if(request.method==='GET'&&url.pathname==='/api/admin/credits/history'){
        const subjectId=url.searchParams.get('subjectId');
        if([...url.searchParams.keys()].length!==1||!subjectId||!UUID.test(subjectId))throw Error('Invalid credit history query');
        if(!deps.commands?.creditHistory){await append(actor.authUserId,'credit:history','denied',subjectId);return json(409,requestId,{error:'ADMIN_CREDIT_UNAVAILABLE'});}
        const rows=await deps.commands.creditHistory(subjectId);if(rows.length>50)throw Error('Unbounded credit history');
        await append(actor.authUserId,'credit:history','allowed',subjectId);return json(200,requestId,{rows:rows.map(requireAdminCommandStateV1)});
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/commands/result') {
        const operation = url.searchParams.get('operation') as AdminCommandKeyV1; const operationId = url.searchParams.get('operationId');
        if ([...url.searchParams.keys()].length !== 2 || !operationId || !UUID.test(operationId) || !bindings.has(operation)) throw new Error('Invalid result lookup.');
        const found = await bindings.get(operation)!.findResult(actor.authUserId,operationId.toLowerCase());
        await append(actor.authUserId,'command:result','allowed',operationId);
        return json(found === null ? 404 : 200,requestId,found === null ? {error:'ADMIN_OPERATION_NOT_FOUND'} : result(found,operationId.toLowerCase()));
      }
      if (request.method === 'GET' && ['/api/admin/presentations','/api/admin/presentations/history'].includes(url.pathname)) {
        const entryId = url.searchParams.get('entryId');
        const history = url.pathname.endsWith('/history');
        if ([...url.searchParams.keys()].some(key => key !== 'entryId') || url.searchParams.getAll('entryId').length > 1 ||
            (entryId !== null && !UUID.test(entryId)) || (history && entryId === null)) throw new Error('Invalid presentation query.');
        if (!deps.commands?.presentations) {
          await append(actor.authUserId,'presentation:blocked','denied');
          return json(409,requestId,{error:'ADMIN_PRESENTATION_UNAVAILABLE'});
        }
        const rows = history ? await deps.commands.presentations.history(entryId!) : await deps.commands.presentations.list(entryId ?? undefined);
        if (rows.length > 50) throw new Error('Invalid presentation page.');
        const safeRows = rows.map(row => requireAdminCommandStateV1(row));
        await append(actor.authUserId,history ? 'presentation:history':'presentation:list','allowed',entryId);
        return json(200,requestId,{rows:safeRows});
      }
      if (request.method !== 'POST' || !['/api/admin/commands/preview','/api/admin/commands/execute'].includes(url.pathname) || url.search !== '' || request.headers.get('origin') !== deps.allowedOrigin) {
        await append(actor.authUserId,'command:invalid','denied'); return json(400,requestId,{error:'ADMIN_COMMAND_BAD_REQUEST'});
      }
      const raw = await boundedJson(request);
      const execute = url.pathname.endsWith('/execute');
      let confirmationToken: string | null = null; let inputRaw: unknown = raw;
      if (execute) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2 || !Object.hasOwn(raw,'input') || !Object.hasOwn(raw,'confirmationToken')) throw new Error('Invalid execution envelope.');
        inputRaw = (raw as {input:unknown}).input;
        confirmationToken = String((raw as {confirmationToken:unknown}).confirmationToken);
      }
      const input = parseAdminCommandInputV1(inputRaw);
      const binding = bindings.get(input.operation);
      if(input.operation==='refund'&&(!deps.commands?.refundSupport?.authority.trim()||deps.commands.refundSupport[input.parameters.mode as 'full'|'partial']!==true)){
        await append(actor.authUserId,'command:refund-unsupported','denied',input.targetRef);return json(409,requestId,{error:'ADMIN_REFUND_MODE_UNSUPPORTED'});
      }
      if (!binding || deps.allowedOrigin === undefined) { await append(actor.authUserId,'command:blocked','denied',input.targetRef); return json(409,requestId,{error:'ADMIN_DOMAIN_COMMAND_UNAVAILABLE',blocker:ADMIN_COMMAND_BLOCKERS_V1[input.operation]}); }
      const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const context = Object.freeze({ actorAuthUserId:actor.authUserId,requestId,payloadHash,input });
      if (!execute) {
        for (const [key,value] of confirmations) if (value.expiresAt <= now.getTime()) confirmations.delete(key);
        if (confirmations.size >= 100) { await append(actor.authUserId,'command:limit','denied');return json(429,requestId,{error:'ADMIN_CONFIRMATION_LIMIT'}); }
        const before = await binding.preview(context);
        if (typeof before.expectedVersion !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(before.expectedVersion)) throw new Error('Invalid preview version.');
        const preview = Object.freeze({ before:requireAdminCommandStateV1(before.before),expectedVersion:before.expectedVersion });
        const expiresAt = now.getTime()+5*60_000;
        const token = signing?.issue({actorAuthUserId:actor.authUserId,operationId:input.operationId,payloadHash,expectedVersion:preview.expectedVersion,expiresAt}) ?? randomUUID();
        await append(actor.authUserId,'command:preview','allowed',input.targetRef);
        if (signing === undefined) confirmations.set(token,{context,preview,expiresAt,running:false});
        return json(200,requestId,{input,preview,confirmationToken:token,expiresAt:new Date(expiresAt).toISOString()});
      }
      const signed = confirmationToken === null ? null : signing?.verify(confirmationToken,now.getTime());
      const confirmation = signing === undefined
        ? confirmationToken === null ? undefined : confirmations.get(confirmationToken)
        : signed && signed.actorAuthUserId === actor.authUserId && signed.operationId === input.operationId && signed.payloadHash === payloadHash
          ? {context,preview:{before:{},expectedVersion:signed.expectedVersion},expiresAt:signed.expiresAt,running:false} : undefined;
      if (!confirmation || confirmation.expiresAt <= now.getTime() || confirmation.context.actorAuthUserId !== actor.authUserId || confirmation.context.payloadHash !== payloadHash) {
        await append(actor.authUserId,'command:confirmation','denied',input.targetRef); return json(409,requestId,{error:'ADMIN_CONFIRMATION_REQUIRED'});
      }
      if (confirmation.running || inflight) { await append(actor.authUserId,'command:busy','denied',input.targetRef);return json(409,requestId,{error:'ADMIN_COMMAND_IN_PROGRESS',operationId:input.operationId}); }
      confirmation.running = true; inflight = true;
      try {
        // Take the in-process lock before awaiting audit persistence. The binding
        // also owns the durable operation receipt across processes and restarts.
        try { await append(actor.authUserId,'command:execute','allowed',input.targetRef); }
        catch { return json(503,requestId,{error:'ADMIN_AUDIT_UNAVAILABLE'}); }
        const executed = result(await binding.execute(context,confirmation.preview.expectedVersion),input.operationId);
        return json(executed.status === 'pending' || executed.status === 'partial' ? 202 : 200,requestId,executed);
      } catch {
        // A network/commit acknowledgement can be uncertain. Re-read the durable
        // receipt using this operation ID before deciding whether to retry.
        try{await deps.audit.append({requestId:randomUUID(),actorAuthUserId:actor.authUserId,targetRef:input.targetRef,
          action:'command:execute-uncertain',outcome:'failed',at:now.toISOString()});}catch{
          return json(503,requestId,{error:'ADMIN_AUDIT_UNAVAILABLE',operationId:input.operationId,recheckRequired:true});
        }
        return json(503,requestId,{error:'ADMIN_COMMAND_RESULT_UNCERTAIN',operationId:input.operationId,recheckRequired:true});
      } finally { confirmation.running = false; inflight = false; }
    } catch {
      try { await append(actor.authUserId,'command:invalid','failed'); } catch { return json(503,requestId,{error:'ADMIN_AUDIT_UNAVAILABLE'}); }
      return json(400,requestId,{error:'ADMIN_COMMAND_BAD_REQUEST'});
    }
  };
}
