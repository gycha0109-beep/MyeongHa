import { isBrowserSajuPreviewDeliveryV1 } from './saju-preview-response-admission.js';

export const SAJU_FIVE_PREVIEW_TOPICS_V1 = Object.freeze([
  Object.freeze({ key: 'general', label: '전체 사주', readingText: '전체 사주' }),
  Object.freeze({ key: 'career', label: '직업 · 커리어', readingText: '직업운' }),
  Object.freeze({ key: 'wealth', label: '재물', readingText: '재물운' }),
  Object.freeze({ key: 'business', label: '사업', readingText: '사업운' }),
  Object.freeze({ key: 'relationship', label: '연애 · 관계', readingText: '연애운' }),
]);

function paragraphTexts(block) {
  switch (block.type) {
    case 'paragraph':
      return block.text.startsWith('근거 구조:') ? [] : [block.text];
    case 'key_points':
      return block.items;
    case 'comparison':
      return block.perspectives.map(item => item.label + ': ' + item.text);
    case 'ambiguity':
      return [block.summary, ...block.scenarios.map(item => item.label + ': ' + item.text)];
    case 'timeline':
      return block.entries.map(item => item.label + ': ' + item.text);
    case 'fact_table':
      return block.rows.map(item => item.label + ': ' + item.value);
    default:
      return []; // Source hints and raw structure are not consumer conclusions.
  }
}

/**
 * A projection of the existing, source-admitted ProductReadingResponse v2.
 * Never synthesize content, admit a non-delivered response, or promote Preview
 * to an Official Reading or paid entitlement.
 */
export function projectSajuFiveDomainPreviewV1(payload) {
  if (!isBrowserSajuPreviewDeliveryV1(payload)) return null;
  const reading = payload.data.reading.reading;
  const sections = reading.sections
    .filter(section => section.state !== 'unavailable' && section.title !== '프리뷰 안내')
    .map(section => ({
      title: section.title,
      paragraphs: section.blocks.flatMap(paragraphTexts),
    }))
    .filter(section => section.paragraphs.length > 0);
  if (sections.length === 0) return null;
  const disclosures = reading.disclosures
    .filter(item => item.type === 'scope_limitation' || item.type === 'insufficient_evidence')
    .map(item => item.text);
  return Object.freeze({
    sections: Object.freeze(sections.map(section => Object.freeze({
      title: section.title,
      paragraphs: Object.freeze([...section.paragraphs]),
    }))),
    disclosures: Object.freeze(disclosures),
    fallback: payload.data.reading.state === 'delivered_with_fallback',
  });
}
