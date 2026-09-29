import type {
  CollectionPaginationV1,
  LifeRecordFactV1,
  LifeRecordPageV1,
  MemoryItemV1,
  MemoryPageV1,
  ReadingHistoryItemV1,
  ReadingHistoryPageV1,
} from '@myeongha/api-client';

import type { MobileRecordsServiceV1 } from './mobile-records-service.js';

export type MobileRecordsCollectionStatusV1 =
  | 'idle'
  | 'loading_initial'
  | 'ready'
  | 'loading_more'
  | 'error';

export interface MobileRecordsCollectionSnapshotV1<T> {
  readonly status: MobileRecordsCollectionStatusV1;
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly errorCode: string | null;
}

export class MobileRecordsRepositoryErrorV1 extends Error {
  constructor(readonly code: 'RECORDS_PAGINATION_PROTOCOL_ERROR', message: string) {
    super(message);
    this.name = 'MobileRecordsRepositoryErrorV1';
  }
}

export interface MobileRecordsCollectionRepositoryV1<T> {
  getSnapshot(): MobileRecordsCollectionSnapshotV1<T>;
  loadInitial(): Promise<MobileRecordsCollectionSnapshotV1<T>>;
  loadMore(): Promise<MobileRecordsCollectionSnapshotV1<T>>;
}

type PageShape<T> = Readonly<{
  items: readonly T[];
  pagination: CollectionPaginationV1;
}>;

function createCollectionRepositoryV1<T>(input: {
  readonly readPage: (options: { pageSize: number; cursor?: string }) => Promise<PageShape<T>>;
  readonly identity: (item: T) => string;
  readonly pageSize: number;
}): MobileRecordsCollectionRepositoryV1<T> {
  let snapshot: MobileRecordsCollectionSnapshotV1<T> = Object.freeze({
    status: 'idle',
    items: Object.freeze([]),
    hasMore: true,
    nextCursor: null,
    errorCode: null,
  });
  let inFlight: Promise<MobileRecordsCollectionSnapshotV1<T>> | null = null;
  const usedCursors = new Set<string>();

  function publish(next: MobileRecordsCollectionSnapshotV1<T>) {
    snapshot = Object.freeze({
      ...next,
      items: Object.freeze([...next.items]),
    });
    return snapshot;
  }

  function protocolError(message: string): never {
    throw new MobileRecordsRepositoryErrorV1(
      'RECORDS_PAGINATION_PROTOCOL_ERROR',
      message,
    );
  }

  function appendPage(
    current: readonly T[],
    page: PageShape<T>,
    requestedCursor: string | null,
  ): MobileRecordsCollectionSnapshotV1<T> {
    if (
      page.pagination.hasMore &&
      page.pagination.nextCursor !== null &&
      (page.pagination.nextCursor === requestedCursor ||
        usedCursors.has(page.pagination.nextCursor))
    ) {
      protocolError('Records pagination cursor did not advance.');
    }

    const seenIds = new Set(current.map(input.identity));
    for (const item of page.items) {
      const id = input.identity(item);
      if (seenIds.has(id)) {
        protocolError('Records pagination returned a duplicate canonical identity.');
      }
      seenIds.add(id);
    }

    if (requestedCursor !== null) usedCursors.add(requestedCursor);

    return Object.freeze({
      status: 'ready',
      items: Object.freeze([...current, ...page.items]),
      hasMore: page.pagination.hasMore,
      nextCursor: page.pagination.nextCursor,
      errorCode: null,
    });
  }

  async function loadInitial() {
    if (inFlight !== null) return inFlight;
    usedCursors.clear();
    publish({
      status: 'loading_initial',
      items: snapshot.items,
      hasMore: snapshot.hasMore,
      nextCursor: snapshot.nextCursor,
      errorCode: null,
    });

    inFlight = (async () => {
      try {
        const page = await input.readPage({ pageSize: input.pageSize });
        const next = appendPage(Object.freeze([]), page, null);
        return publish(next);
      } catch (error) {
        publish({
          status: 'error',
          items: snapshot.items,
          hasMore: snapshot.hasMore,
          nextCursor: snapshot.nextCursor,
          errorCode:
            error instanceof MobileRecordsRepositoryErrorV1
              ? error.code
              : 'RECORDS_LOAD_FAILED',
        });
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function loadMore() {
    if (inFlight !== null) return inFlight;
    if (!snapshot.hasMore) return snapshot;
    if (snapshot.nextCursor === null) {
      if (snapshot.status === 'idle') return loadInitial();
      const error = new MobileRecordsRepositoryErrorV1(
        'RECORDS_PAGINATION_PROTOCOL_ERROR',
        'Records pagination expected a next cursor.',
      );
      publish({
        ...snapshot,
        status: 'error',
        errorCode: error.code,
      });
      throw error;
    }

    const cursor = snapshot.nextCursor;
    publish({
      ...snapshot,
      status: 'loading_more',
      errorCode: null,
    });
    inFlight = (async () => {
      try {
        const page = await input.readPage({
          pageSize: input.pageSize,
          cursor,
        });
        return publish(appendPage(snapshot.items, page, cursor));
      } catch (error) {
        publish({
          ...snapshot,
          status: 'error',
          errorCode:
            error instanceof MobileRecordsRepositoryErrorV1
              ? error.code
              : 'RECORDS_LOAD_FAILED',
        });
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    loadInitial,
    loadMore,
  });
}

function lifePage(page: LifeRecordPageV1): PageShape<LifeRecordFactV1> {
  return Object.freeze({ items: page.facts, pagination: page.pagination });
}

function readingPage(page: ReadingHistoryPageV1): PageShape<ReadingHistoryItemV1> {
  return Object.freeze({ items: page.readings, pagination: page.pagination });
}

function memoryPage(page: MemoryPageV1): PageShape<MemoryItemV1> {
  return Object.freeze({ items: page.memories, pagination: page.pagination });
}

export function createMobileRecordsRepositoriesV1(
  service: MobileRecordsServiceV1,
  pageSize = 20,
): Readonly<{
  life: MobileRecordsCollectionRepositoryV1<LifeRecordFactV1>;
  readings: MobileRecordsCollectionRepositoryV1<ReadingHistoryItemV1>;
  memories: MobileRecordsCollectionRepositoryV1<MemoryItemV1>;
}> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError('Mobile Records repository pageSize must be between 1 and 50.');
  }

  return Object.freeze({
    life: createCollectionRepositoryV1<LifeRecordFactV1>({
      pageSize,
      identity: (item) => item.lifeFactId,
      readPage: async (options) => lifePage(await service.readLifeRecordPage(options)),
    }),
    readings: createCollectionRepositoryV1<ReadingHistoryItemV1>({
      pageSize,
      identity: (item) => item.readingId,
      readPage: async (options) => readingPage(await service.readReadingPage(options)),
    }),
    memories: createCollectionRepositoryV1<MemoryItemV1>({
      pageSize,
      identity: (item) => item.memoryItemId,
      readPage: async (options) => memoryPage(await service.readMemoryPage(options)),
    }),
  });
}
