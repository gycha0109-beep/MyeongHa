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
const VERCEL_DYNAMIC_CHAT_THREAD_PARAM = 'threadId' as const;
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
  profileRuntime ??= createProductionCurrentSubjectProfileRuntimeV1({ env: process.env });
  return profileRuntime;
}

function getLifeRecordRuntime(): ReturnType<typeof createProductionLifeRecordReadRuntimeV1> {
  lifeRecordRuntime ??= createProductionLifeRecordReadRuntimeV1({ env: process.env });
  return lifeRecordRuntime;
}

function getMemoriesRuntime(): ReturnType<typeof createProductionMemoryItemsReadRuntimeV1> {
  memoriesRuntime ??= createProductionMemoryItemsReadRuntimeV1({ env: process.env });
  return memoriesRuntime;
}

function getChatRuntime(): ReturnType<typeof createProductionChatReadRuntimeV1> {
  chatRuntime ??= createProductionChatReadRuntimeV1({ env: process.env });
  return chatRuntime;
}

type DispatchTarget =
  | { readonly kind: 'profile'; readonly route: typeof PROFILE_ROUTE; readonly runtime: ReturnType<typeof getProfileRuntime> }
  | { readonly kind: 'records'; readonly route: typeof LIFE_RECORD_ROUTE | typeof MEMORIES_ROUTE; readonly runtime: ReturnType<typeof getLifeRecordRuntime> | ReturnType<typeof getMemoriesRuntime> }
  | { readonly kind: 'chat'; readonly route: string; readonly afterSequenceNo?: string; readonly runtime: ReturnType<typeof getChatRuntime> };

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

function resolveDispatchTarget(request: Request): DispatchTarget | null {
  const url = new URL(request.url);
  if (url.hash !== '' || url.pathname !== PROFILE_ROUTE) return null;

  const keys = [...new Set(url.searchParams.keys())];
  const knownKeys = new Set<string>([
    RECORDS_ROUTE_PARAM,
    CHAT_THREAD_PARAM,
    VERCEL_DYNAMIC_CHAT_THREAD_PARAM,
    CHAT_CURSOR_PARAM,
    VERCEL_SHARE_PARAM,
  ]);
  if (keys.some((key) => !knownKeys.has(key))) return null;

  const shareValue = getSingleNonEmptyParam(url.searchParams, VERCEL_SHARE_PARAM);
  if (shareValue === null) return null;

  const recordsRoute = getSingleNonEmptyParam(url.searchParams, RECORDS_ROUTE_PARAM);
  if (recordsRoute === null) return null;
  const chatThreadId = getSingleNonEmptyParam(url.searchParams, CHAT_THREAD_PARAM);
  if (chatThreadId === null) return null;
  const vercelDynamicThreadId = getSingleNonEmptyParam(
    url.searchParams,
    VERCEL_DYNAMIC_CHAT_THREAD_PARAM,
  );
  if (vercelDynamicThreadId === null) return null;
  const afterSequenceNo = getSingleNonEmptyParam(url.searchParams, CHAT_CURSOR_PARAM);
  if (afterSequenceNo === null) return null;

  if (recordsRoute !== undefined && chatThreadId !== undefined) return null;
  if (recordsRoute !== undefined && vercelDynamicThreadId !== undefined) return null;
  if (recordsRoute !== undefined && afterSequenceNo !== undefined) return null;
  if (chatThreadId === undefined && vercelDynamicThreadId !== undefined) return null;
  if (chatThreadId === undefined && afterSequenceNo !== undefined) return null;
  if (
    chatThreadId !== undefined &&
    vercelDynamicThreadId !== undefined &&
    vercelDynamicThreadId !== chatThreadId
  ) {
    return null;
  }

  if (recordsRoute === undefined && chatThreadId === undefined) {
    return { kind: 'profile', route: PROFILE_ROUTE, runtime: getProfileRuntime() };
  }

  if (recordsRoute === 'life-record') {
    return { kind: 'records', route: LIFE_RECORD_ROUTE, runtime: getLifeRecordRuntime() };
  }
  if (recordsRoute === 'memories') {
    return { kind: 'records', route: MEMORIES_ROUTE, runtime: getMemoriesRuntime() };
  }
  if (recordsRoute !== undefined) return null;

  if (chatThreadId === undefined || !isUuid(chatThreadId)) return null;
  if (afterSequenceNo !== undefined && !/^(0|[1-9][0-9]*)$/u.test(afterSequenceNo)) return null;

  return {
    kind: 'chat',
    route: `${CHAT_ROUTE_PREFIX}${chatThreadId}`,
    ...(afterSequenceNo === undefined ? {} : { afterSequenceNo }),
    runtime: getChatRuntime(),
  };
}

function toCanonicalRequest(request: Request, target: DispatchTarget): Request {
  const url = new URL(`https://myeongha.internal${target.route}`);
  if (target.kind === 'chat' && target.afterSequenceNo !== undefined) {
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
