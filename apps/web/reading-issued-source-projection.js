// Product Reading block types are part of the issued source contract.
// The archived report must not pass provenance hints off as interpretation.
export function blockTexts(block) {
  if (!block || typeof block !== 'object') return [];
  if (block.type === 'paragraph' || block.type === 'source_hint') {
    return typeof block.text === 'string' && block.text.trim() ? [block.text.trim()] : [];
  }
  if (block.type === 'key_points' && Array.isArray(block.items)) {
    return block.items.filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim());
  }
  if (block.type === 'comparison' && Array.isArray(block.perspectives)) {
    return block.perspectives.flatMap((item) =>
      item && typeof item === 'object' && typeof item.text === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
        : []);
  }
  if (block.type === 'ambiguity') {
    const texts = typeof block.summary === 'string' ? [block.summary] : [];
    if (Array.isArray(block.scenarios)) {
      texts.push(...block.scenarios.flatMap((item) =>
        item && typeof item === 'object' && typeof item.text === 'string'
          ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
          : []));
    }
    return texts;
  }
  if (block.type === 'timeline' && Array.isArray(block.entries)) {
    return block.entries.flatMap((item) =>
      item && typeof item === 'object' && typeof item.text === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
        : []);
  }
  if (block.type === 'fact_table' && Array.isArray(block.rows)) {
    return block.rows.flatMap((item) =>
      item && typeof item === 'object' && typeof item.value === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.value}`]
        : []);
  }
  return [];
}

export function issuedSectionSourcePartsV1(blocks, {
  isStoredRecord = false,
  structurePrefix = '근거 구조:',
} = {}) {
  const structure = [];
  const interpretation = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    for (const text of blockTexts(block)) {
      if ((isStoredRecord && block.type === 'source_hint') || text.startsWith(structurePrefix)) {
        structure.push(text);
      } else {
        interpretation.push(text);
      }
    }
  }
  return Object.freeze({
    structure: Object.freeze(structure),
    interpretation: Object.freeze(interpretation),
  });
}
