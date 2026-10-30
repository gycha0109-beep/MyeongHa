export const ADMIN_COMMAND_KEYS_V1 = ['credit-adjust','refund','account-restrict','account-release','account-delete-request','account-restore','presentation-save'] as const;
export type AdminCommandKeyV1 = typeof ADMIN_COMMAND_KEYS_V1[number];
export type AdminCommandStateV1 = Readonly<Record<string, string | number | boolean | null>>;

export type AdminPresentationDraftV1 = Readonly<{
  entryId: string; expectedRevision: number; kind: 'notice' | 'banner';
  title: string; body: string; linkPath: string | null; status: 'draft' | 'published';
  startsAt: string | null; endsAt: string | null;
}>;
export type AdminCommandInputV1 = Readonly<{
  operation: AdminCommandKeyV1; operationId: string; targetRef: string; reason: string;
  parameters: AdminCommandStateV1;
}>;
export type AdminCommandContextV1 = Readonly<{
  actorAuthUserId: string; requestId: string; payloadHash: string;
  input: AdminCommandInputV1;
}>;
export type AdminCommandPreviewV1 = Readonly<{ before: AdminCommandStateV1; expectedVersion: string }>;
export type AdminCommandResultV1 = Readonly<{
  operationId: string; targetRef: string; status: 'succeeded' | 'replayed' | 'pending' | 'partial' | 'failed';
  state: AdminCommandStateV1;
}>;

/** Binding implementation must own the atomic domain command, durable idempotency
 * receipt and reason/audit history. Merely exposing a table-write port is forbidden. */
export interface AdminCommandBindingV1 {
  readonly operation: AdminCommandKeyV1;
  readonly authority: string;
  preview(context: AdminCommandContextV1): Promise<AdminCommandPreviewV1>;
  execute(context: AdminCommandContextV1, expectedVersion: string): Promise<AdminCommandResultV1>;
  findResult(actorAuthUserId: string, operationId: string): Promise<AdminCommandResultV1 | null>;
}
export interface AdminPresentationQueriesV1 {
  list(entryId?: string): Promise<readonly AdminCommandStateV1[]>;
  history(entryId: string): Promise<readonly AdminCommandStateV1[]>;
}
export interface AdminCommandServicesV1 {
  readonly bindings: readonly AdminCommandBindingV1[];
  readonly presentations?: AdminPresentationQueriesV1;
  readonly refundSupport?: { readonly full:boolean; readonly partial:boolean; readonly authority:string };
  readonly creditHistory?:(subjectId:string)=>Promise<readonly AdminCommandStateV1[]>;
}

export const ADMIN_COMMAND_BLOCKERS_V1: Readonly<Record<AdminCommandKeyV1, string>> = Object.freeze({
  'credit-adjust': '전용 크레딧 보정 RPC·Command Executor의 설치 및 운영 실행 권한 검증이 필요합니다.',
  refund: '기존 withdrawal 검토는 읽기 전용이며 PSP 환불·부분 환불·권한/크레딧 회수 실행 계약이 없습니다.',
  'account-restrict': 'subjects lifecycle에 관리자 제한 상태와 인증 차단/해제의 승인 계약이 없습니다.',
  'account-release': '관리자 제한 해제의 도메인·인증 실행 계약이 없습니다.',
  'account-delete-request': '회원 본인 삭제 명령을 관리자 권한으로 대체하는 계약이 없습니다.',
  'account-restore': '계정 복구 가능성·인증 복구 계약이 없습니다. 삭제된 개인정보는 복원하지 않습니다.',
  'presentation-save': '표현 정보 전용 Command Executor와 저장 스키마 연결이 필요합니다.',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string,unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid command fields.');
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value); }
function date(value: unknown): value is string | null {
  if(value===null)return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)||!Number.isFinite(Date.parse(value)))return false;
  return new Date(value).toISOString()===(value.includes('.')?value:value.replace('Z','.000Z'));
}

export function parseAdminCommandInputV1(value: unknown): AdminCommandInputV1 {
  if (!record(value)) throw new Error('Invalid command input.');
  exact(value, ['operation','operationId','targetRef','reason','parameters']);
  if (!ADMIN_COMMAND_KEYS_V1.includes(value.operation as AdminCommandKeyV1) || typeof value.operationId !== 'string' || !UUID.test(value.operationId) ||
      typeof value.targetRef !== 'string' || !UUID.test(value.targetRef) || !text(value.reason,500) || !record(value.parameters)) throw new Error('Invalid command envelope.');
  const p = value.parameters;
  switch (value.operation) {
    case 'presentation-save': {
      exact(p,['expectedRevision','kind','title','body','linkPath','status','startsAt','endsAt']);
      if (!Number.isSafeInteger(p.expectedRevision) || Number(p.expectedRevision) < 0 || Number(p.expectedRevision) > 1_000_000 ||
          !['notice','banner'].includes(String(p.kind)) || !text(p.title,160) || !text(p.body,p.kind === 'banner' ? 1000 : 5000) ||
          !(p.linkPath === null || (typeof p.linkPath === 'string' && /^\/[A-Za-z0-9/_.-]*(?:\?[A-Za-z0-9_.%=&-]*)?$/u.test(p.linkPath) && p.linkPath.length <= 200 && !p.linkPath.startsWith('//') && !p.linkPath.includes('..'))) ||
          !['draft','published'].includes(String(p.status)) || !date(p.startsAt) || !date(p.endsAt) ||
          (p.startsAt !== null && p.endsAt !== null && Date.parse(p.startsAt) >= Date.parse(p.endsAt))) throw new Error('Invalid presentation command.');
      break;
    }
    case 'credit-adjust':
      if (Object.keys(p).some(key=>!['delta','expiresAt'].includes(key)) || !Object.hasOwn(p,'delta') ||
          !Number.isSafeInteger(p.delta) || Number(p.delta) === 0 ||
          // Existing Lot columns are PostgreSQL integer. These are storage
          // type boundaries, not a per-operation product or business cap.
          Number(p.delta)<-2_147_483_648 || Number(p.delta)>2_147_483_647 ||
          (Number(p.delta)>0 && !Object.hasOwn(p,'expiresAt')) ||
          (p.expiresAt!==undefined && !date(p.expiresAt)) ||
          (Number(p.delta)<0 && p.expiresAt!==undefined && p.expiresAt!==null)) throw new Error('Invalid credit adjustment.');
      break;
    case 'refund':
      exact(p,['amountMinor','mode']);
      if (!Number.isSafeInteger(p.amountMinor) || Number(p.amountMinor) <= 0 || !['full','partial'].includes(String(p.mode))) throw new Error('Invalid refund command.');
      break;
    default: exact(p,[]);
  }
  // Canonical key ordering makes same-key/different-request checks stable.
  const parameters: Record<string,string|number|boolean|null> = {};
  for (const key of Object.keys(p).sort()) parameters[key] = p[key] as string|number|boolean|null;
  if(value.operation==='credit-adjust'&&p.expiresAt===undefined)parameters.expiresAt=null;
  return Object.freeze({ operation: value.operation as AdminCommandKeyV1, operationId: value.operationId.toLowerCase(), targetRef: value.targetRef.toLowerCase(), reason: value.reason.trim(), parameters: Object.freeze(parameters) });
}

export function requireAdminCommandStateV1(value: unknown): AdminCommandStateV1 {
  if (!record(value) || Object.keys(value).length > 32) throw new Error('Invalid command state.');
  for (const [key,item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(key) || !(item === null || typeof item === 'boolean' || (typeof item === 'string' && item.length <= 6000) || (typeof item === 'number' && Number.isSafeInteger(item)))) throw new Error('Invalid command state field.');
  }
  return Object.freeze({ ...value }) as AdminCommandStateV1;
}
