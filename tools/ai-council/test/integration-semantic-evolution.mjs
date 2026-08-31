const integrationHeadings = ['AGREED', 'CONFLICT', 'REQUIREMENTS', 'DECISION CANDIDATE', 'FAILURE CASES', 'METRICS / VALIDATION', 'OPEN', 'NEXT TEST'];
const agentLabels = ['World', 'Revenue', 'Engineering'];

function normalizeHeadingLine(line) {
  return String(line || '').trim().replace(/^#{1,6}\s*/, '').replace(/:\s*$/, '').trim().toUpperCase();
}

function parseSections(content) {
  const expected = new Map(integrationHeadings.map((heading) => [heading.toUpperCase(), heading]));
  const sections = {};
  let current = null;
  for (const line of String(content || '').split(/\r?\n/)) {
    const heading = expected.get(normalizeHeadingLine(line));
    if (heading) {
      current = heading;
      if (!Object.hasOwn(sections, heading)) sections[heading] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([heading, lines]) => [heading, lines.join('\n').trim()]));
}

function sourceHasRoundTwo(meeting, label) {
  const agent = label.toLowerCase();
  return (meeting.messages || []).some((message) => message.agent === agent && message.round === 2);
}

function conflictAgentLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).map((line) => {
    const match = line.match(/^(World|Revenue|Engineering)\s*:\s*(.+)$/i);
    if (!match) return null;
    const label = agentLabels.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase());
    return { label, text: match[2] };
  }).filter(Boolean);
}

function quantitativeTokens(value) {
  const tokens = [];
  const pattern = /\d+(?:[.,]\d+)?\s*(?:%|원|달러|USD|KRW|일|주|개월|년|시간|분|초|회|명|건|개|토큰|tokens?|자)/giu;
  for (const match of String(value || '').matchAll(pattern)) tokens.push(match[0].replace(/\s+/g, '').toLowerCase());
  return tokens;
}

function sourceCorpus(meeting) {
  return [
    meeting.topic || '',
    ...(meeting.messages || []).map((message) => message.content || ''),
  ].join('\n');
}

export function validateIntegrationSemanticEvolution(meeting, content) {
  const sections = parseSections(content);
  const conflict = sections.CONFLICT || '';

  if (conflict.trim().toUpperCase() !== '- NONE OBSERVED IN TRANSCRIPT' && conflict.trim().toUpperCase() !== 'NONE OBSERVED IN TRANSCRIPT') {
    for (const line of conflictAgentLines(conflict)) {
      if (sourceHasRoundTwo(meeting, line.label) && !new RegExp(`\\[${line.label}\\s+R2\\]`, 'i').test(line.text)) {
        throw new Error(`Integration CONFLICT의 ${line.label}: 현재 입장은 [${line.label} R2]를 같은 Agent 줄에서 직접 인용해야 합니다. R1 입장을 R2 이후 현재 충돌처럼 재활성화할 수 없습니다.`);
      }
    }
  }

  const sourceNumbers = new Set(quantitativeTokens(sourceCorpus(meeting)));
  const inventedNumbers = quantitativeTokens(content).filter((token) => !sourceNumbers.has(token));
  if (inventedNumbers.length) {
    throw new Error(`Integration이 transcript/user topic에 없는 정량 수치를 새로 확정했습니다: ${[...new Set(inventedNumbers)].join(', ')}. 기간·quota·threshold·가격·횟수 등 정확한 수치는 source에 있을 때만 사용할 수 있습니다.`);
  }

  return sections;
}

export function integrationSemanticInstruction() {
  return `[INTEGRATION SEMANTIC EVOLUTION RULE]\n- CONFLICT에서 Agent의 Round 2 발언이 존재하면 그 Agent의 현재 입장은 반드시 같은 Agent 줄에서 [Agent R2]를 직접 인용하십시오. R1의 초기 입장이 R2에서 수정·수용·철회되었다면 그 R1 입장을 현재 unresolved conflict로 재활성화하지 마십시오.\n- transcript 또는 사용자 topic에 없는 정확한 기간·quota·threshold·가격·횟수·비율 등 정량 수치를 새로 만들지 마십시오. 예: source에 없는 \"4주\", \"30일\", \"10%\"를 NEXT TEST에 넣지 마십시오. 수치가 필요하지만 source에 없으면 \"기간 미정\", \"threshold 미정\"처럼 남기십시오.`;
}
