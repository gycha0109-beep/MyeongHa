import { randomUUID } from 'node:crypto';
import { createProductionChatReadRuntimeV1 } from '../apps/api/src/production-chat-read-runtime.js';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.js';
import {
  createProductionLifeRecordReadRuntimeV1,
  createProductionMemoryItemsReadRuntimeV1,
} from '../apps/api/src/production-records-read-runtime.js';

const PROFILE_ROUTE = '/api/me' as const;
const LIFE_RECORD_ROUTE = '/api/life-record' as const;
const MEMORIES_ROUTE = '/api/memories' as const;
const CHAT_ROUTE_PREFIX = '/api/chat/' as const;
const RECORDS_ROUTE_PARAM = '__myeongha_records_read' as const;
const CHAT_THREAD_PARAM = '__myeongha_chat_thread_id' as const;
const CHAT_PRESENTATION_PARAM = 'presentationKey' as const;
const CHAT_CURSOR_PARAM = 'afterSequenceNo' as const;
const VERCEL_SHARE_PARAM = '_vercel_share' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

let profileRuntime:
  | ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1>
  | undefined;
let lifeRecordRuntime:
  | ReturnType<typeof createProductionLifeRecordReadRuntimeV1>
  | undefined;
let memoriesRuntime:
  | ReturnType<typeof createProductionMemoryItemsReadRuntimeV1>
  | undefined;
let chatRuntime:
  | ReturnType<typeof createProductionChatReadRuntimeV1>
  | undefined;

function getProfileRuntime(): ReturnType<typeof createProductionCurrentSubjectProfileRuntimeV1> {
  profileRuntime ??= createProductionCurrentSubjectProfileRuntimeV1({
    env: process.env,
  });
  return profileRuntime;
}

function getLifeRecordRuntime(): ReturnType<typeof createProductionLifeRecordReadRuntimeV1> {
  lifeRecordRuntime ??= createProductionLifeRecordReadRuntimeV1({
    env: process.env,
  });
  return lifeRecordRuntime;
}

function getMemoriesRuntime(): ReturnType<typeof createProductionMemoryItemsReadRuntimeV1> {
  memoriesRuntime ??= createProductionMemoryItemsReadRuntimeV1({
    env: process.env,
  });
  return memoriesRuntime;
}

function getChatRuntime(): ReturnType<typeof createProductionChatReadRuntimeV1> {
  chatRuntime ??= createProductionChatReadRuntimeV1({
    env: process.env,
  });
  return chatRuntime;
}

type StaticDispatchTarget =
  | { readonly kind: 'static'; readonly route: typeof PROFILE_ROUTE; readonly runtime: ReturnType<typeof getProfileRuntime> }
  | { readonly kind: 'static'; readonly route: typeof LIFE_RECORD_ROUTE; readonly runtime: ReturnType<typeof getLifeRecordRuntime> }
  | { readonly kind: 'static'; readonly route: typeof MEMORIES_ROUTE; readonly runtime: ReturnType<typeof getMemoriesRuntime> };

type ChatDispatchTarget = Readonly<{
  kind: 'chat';
  threadId: string;
  presentationKey: string;
  afterSequenceNo: string | undefined;
  runtime: ReturnType<typeof getChatRuntime>;
}>;

type DispatchTarget = StaticDispatchTarget | ChatDispatchTarget;

function getSingleNonEmptyParam(
  searchParams: URLSearchParams,
  key: string,
): string | null | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || values[0] === undefined || values[0].length === 0) return null;
  return values[0];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isPresentationKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value);
}

function isCursor(value: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}

function resolveChatTarget(url: URL): ChatDispatchTarget | null {
  const allowedKeys = new Set([
    CHAT_THREAD_PARAM,
    CHAT_PRESENTATION_PARAM,
    CHAT_CURSOR_PARAM,
    VERCEL_SHARE_PARAM,
  ]);
  const keys = [...new Set(url.searchParams.keys())];
  if (keys.some((key) => !allowedKeys.has(key))) return null;

  const shareValue = getSingleNonEmptyParam(url.searchParams, VERCEL_SHARE_PARAM);
  if (shareValue === null) return null;
  const threadId = getSingleNonEmptyParam(url.searchParams, CHAT_THREAD_PARAM);
  const presentationKey = getSingleNonEmptyParam(url.searchParams, CHAT_PRESENTATION_PARAM);
  const afterSequenceNo = getSingleNonEmptyParam(url.searchParams, CHAT_CURSOR_PARAM);

  if (
    typeof threadId !== 'string' ||
    !isUuid(threadId) ||
    typeof presentationKey !== 'string' ||
    !isPresentationKey(presentationKey) ||
    afterSequenceNo === null ||
    (typeof afterSequenceNo === 'string' && !isCursor(afterSequenceNo))
  ) {
    return null;
  }

  if (url.pathname !== PROFILE_ROUTE && url.pathname !== `${CHAT_ROUTE_PREFIX}${threadId}`) {
    return null;
  }

  return {
    kind: 'chat',
    threadId,
    presentationKey,
    afterSequenceNo,
    runtime: getChatRuntime(),
  };
}

function resolveDispatchTarget(request: Request): DispatchTarget | null {
  const url = new URL(request.url);
  if (url.hash !== '') return null;

  if (url.searchParams.has(CHAT_THREAD_PARAM)) {
    return resolveChatTarget(url);
  }

  const keys = [...new Set(url.searchParams.keys())];
  if (keys.some((key) => key !== RECORDS_ROUTE_PARAM && key !== VERCEL_SHARE_PARAM)) {
    return null;
  }

  const shareValue = getSingleNonEmptyParam(url.searchParams, VERCEL_SHARE_PARAM);
  if (shareValue === null) return null;

  const recordsRoute = getSingleNonEmptyParam(url.searchParams, RECORDS_ROUTE_PARAM);
  if (recordsRoute === null) return null;

  if (recordsRoute === undefined) {
    return url.pathname === PROFILE_ROUTE
      ? { kind: 'static', route: PROFILE_ROUTE, runtime: getProfileRuntime() }
      : null;
  }

  if (
    recordsRoute === 'life-record' &&
    (url.pathname === PROFILE_ROUTE || url.pathname === LIFE_RECORD_ROUTE)
  ) {
    return { kind: 'static', route: LIFE_RECORD_ROUTE, runtime: getLifeRecordRuntime() };
  }

  if (
    recordsRoute === 'memories' &&
    (url.pathname === PROFILE_ROUTE || url.pathname === MEMORIES_ROUTE)
  ) {
    return { kind: 'static', route: MEMORIES_ROUTE, runtime: getMemoriesRuntime() };
  }

  return null;
}

function toCanonicalRequest(request: Request, target: DispatchTarget): Request {
  if (target.kind === 'static') {
    return new Request(`https://myeongha.internal${target.route}`, {
      method: request.method,
      headers: request.headers,
    });
  }

  const url = new URL(
    `https://myeongha.internal${CHAT_ROUTE_PREFIX}${encodeURIComponent(target.threadId)}`,
  );
  url.searchParams.set(CHAT_PRESENTATION_PARAM, target.presentationKey);
  if (target.afterSequenceNo !== undefined) {
    url.searchParams.set(CHAT_CURSOR_PARAM, target.afterSequenceNo);
  }
  return new Request(url, {
    method: request.method,
    headers: request.headers,
  });
}

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const target = resolveDispatchTarget(request);
    if (target === null) return routeNotFound();

    return target.runtime.handleRequest({
      request: toCanonicalRequest(request, target),
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    });
  },
};
