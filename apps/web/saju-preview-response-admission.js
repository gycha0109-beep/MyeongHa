// Browser defense-in-depth. The Saju service and server transport own source admission.
// This guard does not grant semantic, Product, or Production authorization.
const RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';
const RESPONSE_ID_PATTERN = /^reading_response_[0-9a-f]{24}$/u;
const SUPPORTED_SECTIONS = new Set([
  'overview', 'structure', 'personality', 'career', 'wealth',
  'relationship', 'health_tendency', 'timing', 'compatibility', 'custom',
]);
const SUPPORTED_DISCLOSURES = new Set([
  'calculation_ambiguity', 'methodology_difference',
  'insufficient_evidence', 'scope_limitation',
]);
const STATE_CONTRACT = Object.freeze({
  delivered: Object.freeze({ messageCode: 'READING_DELIVERED', requiredAction: 'none' }),
  delivered_with_fallback: Object.freeze({
    messageCode: 'READING_DELIVERED_WITH_GROUNDED_FALLBACK',
    requiredAction: 'none',
  }),
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pairs(value, field) {
  return Array.isArray(value) && value.every((item) =>
    record(item) && text(item.label) && text(item[field]));
}

function knownBlock(block) {
  if (!record(block) || !text(block.type)) return false;
  switch (block.type) {
    case 'paragraph':
    case 'source_hint':
      return text(block.text);
    case 'key_points':
      return Array.isArray(block.items) && block.items.every(text);
    case 'comparison':
      return text(block.title) && pairs(block.perspectives, 'text');
    case 'ambiguity':
      return text(block.summary) && pairs(block.scenarios, 'text');
    case 'timeline':
      return pairs(block.entries, 'text');
    case 'fact_table':
      return pairs(block.rows, 'value');
    default:
      return false;
  }
}

function knownSection(section) {
  return record(section) &&
    SUPPORTED_SECTIONS.has(section.sectionType) &&
    ['complete', 'partial', 'unavailable'].includes(section.state) &&
    text(section.title) &&
    Array.isArray(section.blocks) &&
    section.blocks.every(knownBlock);
}

function knownDisclosure(disclosure) {
  return record(disclosure) &&
    SUPPORTED_DISCLOSURES.has(disclosure.type) &&
    text(disclosure.text);
}

/**
 * Only validates that the already source-admitted HTTP delivery is safe for
 * the existing browser renderer's narrower display vocabulary.
 * It cannot make a non-delivered product appear delivered.
 */
export function isBrowserSajuPreviewDeliveryV1(payload) {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return false;
  if (payload.data.lifecycle !== 'preview') return false;

  const response = payload.data.reading;
  if (!record(response) ||
      response.responseVersion !== RESPONSE_VERSION ||
      !RESPONSE_ID_PATTERN.test(response.responseId) ||
      !Object.hasOwn(STATE_CONTRACT, response.state)) return false;

  const contract = STATE_CONTRACT[response.state];
  if (response.messageCode !== contract.messageCode ||
      response.requiredAction !== contract.requiredAction) return false;

  const reading = response.reading;
  if (!record(reading) || !text(reading.readingId) ||
      !Array.isArray(reading.sections) || !Array.isArray(reading.disclosures)) return false;

  if (!reading.sections.every(knownSection) ||
      !reading.disclosures.every(knownDisclosure)) return false;

  // The browser must not render a fake "success" with zero meaningful sections.
  return reading.sections.some((section) =>
    section.state !== 'unavailable' &&
    section.title !== '프리뷰 안내' &&
    section.blocks.some((block) => {
      if (block.type === 'source_hint') return false;
      if (block.type === 'paragraph') return !block.text.startsWith('근거 구조:');
      return true;
    }));
}
