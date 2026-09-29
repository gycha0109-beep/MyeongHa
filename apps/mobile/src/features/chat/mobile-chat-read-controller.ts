import type { MobileChatThreadSnapshotV1 } from './mobile-chat-read-repository.js';
import type { MobileChatReadRepositoryV1 } from './mobile-chat-read-repository.js';

export interface MobileChatReadControllerV1 {
  getSnapshot(): MobileChatThreadSnapshotV1;
  loadInitial(): Promise<MobileChatThreadSnapshotV1>;
  loadMore(): Promise<MobileChatThreadSnapshotV1>;
}

export function createMobileChatReadControllerV1(
  repository: MobileChatReadRepositoryV1,
): MobileChatReadControllerV1 {
  async function loadInitial() {
    try {
      return await repository.loadInitial();
    } catch {
      return repository.getSnapshot();
    }
  }

  async function loadMore() {
    try {
      return await repository.loadMore();
    } catch {
      return repository.getSnapshot();
    }
  }

  return Object.freeze({
    getSnapshot: () => repository.getSnapshot(),
    loadInitial,
    loadMore,
  });
}
