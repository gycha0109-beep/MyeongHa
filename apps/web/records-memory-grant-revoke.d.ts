export class MemoryGrantRevokeError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
}

export interface RecordsGrantRevokeClientOptionsV1 {
  readonly fetchImpl?: (endpoint: string, init?: RequestInit) => Promise<Response>;
  readonly resolveBearer?: () => Promise<Readonly<{ kind: string; token: string }> | null> | Readonly<{ kind: string; token: string }> | null;
  readonly memoriesEndpoint?: string;
}

export function createRecordsMemoryGrantRevokeClient(options?: RecordsGrantRevokeClientOptionsV1): Readonly<{
  revokeSeyeonMemoryGrant(memoryItemId: string): Promise<Readonly<{
    memoryItemId: string;
    characterId: 'seyeon';
    revokedGrantCount: number;
    replayed: boolean;
  }>>;
}>;
