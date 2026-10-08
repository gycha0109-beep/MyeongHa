export type RecordsSubjectBearerV1 = Readonly<{
  kind: string;
  token: string;
}>;

export interface RecordsPageSnapshotV1 {
  readonly pagination: {
    readonly pageSize: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

export type RecordsCurrentBirthStateV1 =
  | Readonly<{ status: 'ready'; payload: { birthProfile: Record<string, unknown> | null } }>
  | Readonly<{ status: 'unavailable' }>;

export interface RecordsRuntimeSnapshotV1 {
  readonly profile: Record<string, unknown>;
  readonly lifeFacts: RecordsPageSnapshotV1 & { readonly facts: readonly unknown[] };
  readonly readings: RecordsPageSnapshotV1 & { readonly readings: readonly unknown[] };
  readonly memories: RecordsPageSnapshotV1 & { readonly memories: readonly unknown[] };
  readonly birth: RecordsCurrentBirthStateV1;
}

export class RecordsRuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
}

export interface RecordsRuntimeClientOptionsV1 {
  readonly fetchImpl?: (endpoint: string, init?: RequestInit) => Promise<Response>;
  readonly resolveBearer?: () => Promise<RecordsSubjectBearerV1 | null> | RecordsSubjectBearerV1 | null;
  readonly endpoints?: Partial<Record<'profile' | 'birthProfile' | 'lifeFacts' | 'readings' | 'memories', string>>;
}

export function createRecordsRuntimeClient(options?: RecordsRuntimeClientOptionsV1): Readonly<{
  readProfile(): Promise<Record<string, unknown>>;
  readLifeFacts(): Promise<RecordsRuntimeSnapshotV1['lifeFacts']>;
  readReadings(): Promise<RecordsRuntimeSnapshotV1['readings']>;
  readMemories(): Promise<RecordsRuntimeSnapshotV1['memories']>;
  readRecords(): Promise<RecordsRuntimeSnapshotV1>;
}>;

export const RECORDS_RUNTIME_ENDPOINTS_V1: Readonly<{
  profile: '/api/me';
  birthProfile: '/api/me/birth-profile';
  lifeFacts: '/api/life-record';
  readings: '/api/readings';
  memories: '/api/memories';
}>;
