import { resolveReadingDetailRoute } from './reading-detail-route.js';
import { resolveSajuButtonEngineRequest } from './reading-saju-engine-request.js';

export const SAJU_PRODUCT_COMPOSITION_INSPECTION_VERSION_V1 =
  'myeongha-saju-product-composition-inspection-v1';

const TOKEN_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const MANIFEST_FIELDS = new Set(['schemaVersion', 'productId', 'productVersion', 'mode', 'slots']);
const SLOT_FIELDS = new Set(['slotId', 'requirement', 'routeSearch']);

const generalNatal = Object.freeze({
  schemaVersion: 'v1',
  productId: 'general-natal-inspection',
  productVersion: 'candidate-1',
  mode: 'inspection_only',
  slots: Object.freeze([
    Object.freeze({
      slotId: 'natal',
      requirement: 'required',
      routeSearch: '?topic=temperament&scope=original',
    }),
  ]),
});

const seyeonReunion = Object.freeze({
  schemaVersion: 'v1',
  productId: 'seyeon-first-love-reunion-research',
  productVersion: 'candidate-1',
  mode: 'inspection_only',
  slots: Object.freeze([
    Object.freeze({
      slotId: 'relationship',
      requirement: 'required',
      routeSearch: '?topic=love',
    }),
    Object.freeze({
      slotId: 'annual',
      requirement: 'optional',
      routeSearch: '?scope=year',
    }),
  ]),
});

export const SAJU_PRODUCT_COMPOSITION_RESEARCH_FIXTURES_V1 = Object.freeze({
  generalNatal,
  seyeonReunion,
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function frozenResult(fields) {
  return Object.freeze({
    inspectionVersion: SAJU_PRODUCT_COMPOSITION_INSPECTION_VERSION_V1,
    ...fields,
    releaseAuthorization: 'NOT_EVALUATED',
    canPublish: false,
    canSell: false,
    canExecute: false,
  });
}

function invalidManifest(reason) {
  return frozenResult({
    state: 'blocked',
    reason,
    requests: Object.freeze([]),
    omittedOptionalSlots: Object.freeze([]),
    requiredInputs: Object.freeze([]),
  });
}

function isSupportedRouteSearch(search) {
  if (typeof search !== 'string' || !search.startsWith('?') || search.length > 160) {
    return false;
  }

  const parameters = new URLSearchParams(search.slice(1));
  if (parameters.size === 0 || parameters.size > 2) return false;
  for (const [key] of parameters) {
    if (key !== 'topic' && key !== 'scope') return false;
    if (parameters.getAll(key).length !== 1) return false;
  }
  return true;
}

function validatedSlots(manifest) {
  if (
    !isRecord(manifest) ||
    !hasExactKeys(manifest, MANIFEST_FIELDS) ||
    manifest.schemaVersion !== 'v1' ||
    manifest.mode !== 'inspection_only' ||
    typeof manifest.productId !== 'string' ||
    !TOKEN_PATTERN.test(manifest.productId) ||
    typeof manifest.productVersion !== 'string' ||
    !TOKEN_PATTERN.test(manifest.productVersion) ||
    !Array.isArray(manifest.slots) ||
    manifest.slots.length < 1 ||
    manifest.slots.length > 8
  ) {
    return null;
  }

  const slotIds = new Set();
  const routeKeys = new Set();
  for (const slot of manifest.slots) {
    if (
      !isRecord(slot) ||
      !hasExactKeys(slot, SLOT_FIELDS) ||
      typeof slot.slotId !== 'string' ||
      !TOKEN_PATTERN.test(slot.slotId) ||
      (slot.requirement !== 'required' && slot.requirement !== 'optional') ||
      !isSupportedRouteSearch(slot.routeSearch)
    ) {
      return null;
    }

    const route = resolveReadingDetailRoute(slot.routeSearch);
    if (!route.valid || slotIds.has(slot.slotId) || routeKeys.has(route.routeKey)) {
      return null;
    }
    slotIds.add(slot.slotId);
    routeKeys.add(route.routeKey);
  }

  return manifest.slots;
}

/**
 * Validates presentation-level reading-request composition only.
 * Neither Saju semantics nor product sale/launch permission is admitted here.
 * This function never executes a request, creates a product, or grants entitlement.
 */
export function inspectSajuProductCompositionV1(manifest, contextsBySlot = {}) {
  const slots = validatedSlots(manifest);
  if (slots === null) return invalidManifest('invalid_manifest');

  if (!isRecord(contextsBySlot)) return invalidManifest('invalid_contexts');

  const allowedSlotIds = new Set(slots.map((slot) => slot.slotId));
  if (Object.keys(contextsBySlot).some((key) => !allowedSlotIds.has(key))) {
    return invalidManifest('unknown_context_slot');
  }

  const requests = [];
  const omittedOptionalSlots = [];
  const requiredInputs = [];

  for (const slot of slots) {
    const context = Object.hasOwn(contextsBySlot, slot.slotId)
      ? contextsBySlot[slot.slotId]
      : {};
    if (!isRecord(context)) return invalidManifest('invalid_slot_context');

    const route = resolveReadingDetailRoute(slot.routeSearch);
    const projection = resolveSajuButtonEngineRequest(route, context);

    if (projection.state === 'invalid') {
      return invalidManifest('invalid_request_projection');
    }

    if (projection.state === 'requires_input') {
      if (slot.requirement === 'required') {
        requiredInputs.push(Object.freeze({
          slotId: slot.slotId,
          input: projection.input,
        }));
      } else {
        omittedOptionalSlots.push(Object.freeze({
          slotId: slot.slotId,
          reason: 'requires_input',
          input: projection.input,
        }));
      }
      continue;
    }

    if (projection.state !== 'ready') {
      return invalidManifest('unknown_request_projection_state');
    }

    requests.push(Object.freeze({
      slotId: slot.slotId,
      requirement: slot.requirement,
      domain: projection.domain,
      readingText: projection.readingText,
      ...(projection.targetPersonRef === undefined
        ? {}
        : { targetPersonRef: projection.targetPersonRef }),
      adapterVersion: projection.adapterVersion,
      mappingVersion: projection.mappingVersion,
    }));
  }

  return frozenResult({
    state: requiredInputs.length === 0 ? 'request_projection_complete' : 'requires_input',
    productId: manifest.productId,
    productVersion: manifest.productVersion,
    requests: Object.freeze(requests),
    omittedOptionalSlots: Object.freeze(omittedOptionalSlots),
    requiredInputs: Object.freeze(requiredInputs),
  });
}
