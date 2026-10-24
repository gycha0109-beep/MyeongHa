// Watchtower-Track: security
// S5/G3 Node composition only. No Vercel/Workers/proxy or public route mount.
import {
  handleSeyeonDirectNodeHttpIngressV1,
  type SeyeonDirectNodeHttpIngressInputV1,
  type SeyeonDirectNodeHttpOutcomeV1,
} from './seyeon-direct-node-http-ingress-v1.js';
import { executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1 } from './seyeon-first-positive-memory-node-delivery-v1.js';

export const SEYEON_FIRST_POSITIVE_MEMORY_NODE_HTTP_INGRESS_V1 = Object.freeze({
  version: 'seyeon-first-positive-memory-node-http-ingress-v1',
  supportedTransport: 'node:http.IncomingMessage+ServerResponse',
  productionRouteMounted: false,
  vercelFetchSupported: false,
  proxyHandoffProven: false,
  historicalReplayAllowed: false,
  memoryCount: 1,
  responseCache: 'no-store',
} as const);

export type SeyeonFirstPositiveMemoryNodeHttpIngressInputV1 =
  Omit<SeyeonDirectNodeHttpIngressInputV1, 'executeAndDeliver'>;

/**
 * Verified Member + canonical body → G1/G2/G3 DB readiness → existing
 * governed runtime → exact original Grant locked read → same Node socket.
 * No source/Grant/Subject, mode, Provider config or response text comes from
 * the client. G3 re-reads the original DB body, never runtimeResult text.
 * This source-only adapter supplies neither DB approval nor last-hop proof.
 */
export function handleSeyeonFirstPositiveMemoryDirectNodeHttpV1(
  input: SeyeonFirstPositiveMemoryNodeHttpIngressInputV1,
): Promise<SeyeonDirectNodeHttpOutcomeV1> {
  return handleSeyeonDirectNodeHttpIngressV1({
    ...input,
    executeAndDeliver: executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1,
  });
}
