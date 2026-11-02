export interface ProductionSeyeonG3HistoryHttpProofV1 {
  readonly anonymous: 401;
  readonly member: 200;
  readonly historicalGet: 503;
  readonly error: 'SEYEON_HISTORY_REVEAL_HOLD';
  readonly noStore: true;
  readonly sameWorkerVersion: true;
  readonly workerVersion: string;
  readonly disclosureAuthorized: false;
}

export interface ProductionSeyeonG3HistoryHttpInputV1 {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: (url: string, options: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly redirect: string;
    readonly signal: AbortSignal;
  }) => Promise<Response>;
  readonly acquireSession?: () => Promise<{readonly accessToken: string}>;
}

export function verifyProductionSeyeonG3HistoryHttpV1(
  input?: ProductionSeyeonG3HistoryHttpInputV1,
): Promise<Readonly<ProductionSeyeonG3HistoryHttpProofV1>>;
