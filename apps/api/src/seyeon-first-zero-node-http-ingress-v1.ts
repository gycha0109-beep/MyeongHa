// Watchtower-Track: security
// Unmounted direct Node HTTP only; source mode is fixed by server composition.
import {
  handleSeyeonDirectNodeHttpIngressV1,
  type SeyeonDirectNodeHttpIngressInputV1,
  type SeyeonDirectNodeHttpOutcomeV1,
} from './seyeon-direct-node-http-ingress-v1.js';
import { executeAndDeliverSeyeonFirstZeroNodeTurnV1 } from './seyeon-first-zero-node-turn-delivery-v1.js';

export const SEYEON_FIRST_ZERO_DIRECT_NODE_HTTP_INGRESS_V1 = Object.freeze({
  version: 'seyeon-first-zero-direct-node-http-ingress-v1',
  supportedTransport: 'node:http.IncomingMessage+ServerResponse',
  productionRouteMounted: false,
  vercelFetchSupported: false,
  proxyHandoffProven: false,
  positiveOrHistoricalSourceReveal: false,
  responseCache: 'no-store',
} as const);

export type SeyeonFirstZeroNodeHttpOutcomeV1 = SeyeonDirectNodeHttpOutcomeV1;
export type SeyeonFirstZeroNodeHttpIngressInputV1 =
  Omit<SeyeonDirectNodeHttpIngressInputV1, 'executeAndDeliver'>;

export function handleSeyeonFirstZeroDirectNodeHttpV1(
  input: SeyeonFirstZeroNodeHttpIngressInputV1,
): Promise<SeyeonFirstZeroNodeHttpOutcomeV1> {
  return handleSeyeonDirectNodeHttpIngressV1({
    ...input,
    executeAndDeliver: executeAndDeliverSeyeonFirstZeroNodeTurnV1,
  });
}
