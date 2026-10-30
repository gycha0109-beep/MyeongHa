export class MemoryGrantConsentError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
}

export interface RecordsGrantConsentClientOptionsV1 {
  readonly fetchImpl?: (endpoint: string, init?: RequestInit) => Promise<Response>;
  readonly resolveBearer?: () => Promise<Readonly<{ kind: string; token: string }> | null> |
    Readonly<{ kind: string; token: string }> | null;
  readonly memoriesEndpoint?: string;
}

export function createRecordsMemoryGrantConsentClient(
  options?: RecordsGrantConsentClientOptionsV1,
): Readonly<{
  grantSeyeonOriginalMemory(memoryItemId: string): Promise<Readonly<{
    memoryItemId: string;
    characterId: 'seyeon';
    currentlyGranted: true;
    grantState: 'active';
  }>>;
}>;
