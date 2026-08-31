const headings = new Set([
  'AGREED',
  'CONFLICT',
  'REQUIREMENTS',
  'DECISION CANDIDATE',
  'FAILURE CASES',
  'METRICS / VALIDATION',
  'OPEN',
  'NEXT TEST',
]);

function normalizedHeading(line) {
  return String(line || '').trim().replace(/^#{1,6}\s*/, '').replace(/:\s*$/, '').trim().toUpperCase();
}

export function canonicalizeIntegrationOutput(content) {
  const lines = String(content || '').split(/\r?\n/);
  const output = [];
  let section = null;
  let conflictOpen = false;

  for (const original of lines) {
    const heading = normalizedHeading(original);
    if (headings.has(heading)) {
      section = heading;
      conflictOpen = false;
      output.push(original.trim());
      continue;
    }

    if (section !== 'CONFLICT') {
      output.push(original);
      continue;
    }

    const trimmed = original.trim();
    const numbered = trimmed.match(/^\d+[.)]\s*(.+)$/);
    if (numbered) {
      conflictOpen = true;
      output.push(`- 논점: ${numbered[1]}`);
      continue;
    }

    if (/^[-*+]\s+논점\s*:/i.test(trimmed)) {
      conflictOpen = true;
      output.push(trimmed.replace(/^[-*+]\s+/, '- '));
      continue;
    }

    if (conflictOpen && /^[-*+]\s*(World|Revenue|Engineering|Status)\s*:/i.test(trimmed)) {
      output.push(`  ${trimmed.replace(/^[-*+]\s*/, '')}`);
      continue;
    }

    if (conflictOpen && /^(World|Revenue|Engineering|Status)\s*:/i.test(trimmed)) {
      output.push(`  ${trimmed}`);
      continue;
    }

    output.push(original);
  }

  return output.join('\n').trim();
}
