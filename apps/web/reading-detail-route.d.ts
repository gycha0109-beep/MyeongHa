export interface ReadingDetailRouteValid {
  readonly valid: true;
  readonly topic: string;
  readonly scope: string;
  readonly label: string;
  readonly scopeLabel: string;
  readonly routeKey: string;
}

export interface ReadingDetailRouteInvalid {
  readonly valid: false;
  readonly reason: string;
  readonly requestedTopic: string | null;
  readonly requestedScope: string | null;
}

export type ReadingDetailRoute = ReadingDetailRouteValid | ReadingDetailRouteInvalid;

export function resolveReadingDetailRoute(
  search?: URLSearchParams | string | null,
): ReadingDetailRoute;
