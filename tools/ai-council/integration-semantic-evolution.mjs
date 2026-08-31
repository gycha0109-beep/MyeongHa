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

function stripBullet(line) {
  return String(line || '').trim().replace(/^[-*+]\s+/, '');
}

function conflictAgentLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => stripBullet(line)).map((line) => {
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

function sourceTranscriptText(source) {
  if (typeof source !== 'string') return '';
  const raw = String(source || '');
  const startMarker = '[ACTUAL TRANSCRIPT]';
  const taskMarker = '[INTEGRATION TASK]';
  const start = raw.indexOf(startMarker);
  if (start < 0) return raw;
  const from = start + startMarker.length;
  const end = raw.indexOf(taskMarker, from);
  return raw.slice(from, end >= 0 ? end : undefined).trim();
}

function sourceTopicText(source) {
  if (typeof source !== 'string') return String(source?.topic || '');
  const raw = String(source || '');
  const start = raw.indexOf('[ACTUAL TRANSCRIPT]');
  if (start < 0) return '';
  return raw.slice(0, start).replace(/^\s*회의 주제:\s*/i, '').trim();
}

function sourceMessages(source) {
  if (source && typeof source !== 'string' && Array.isArray(source.messages)) {
    return source.messages.filter(
      (message) => ['world', 'revenue', 'engineering'].includes(message.agent) && [1, 2].includes(message.round),
    );
  }

  const messages = [];
  let current = null;
  for (const line of sourceTranscriptText(source).split(/\r?\n/)) {
    const match = line.trim().match(/^\[(World|Revenue|Engineering)(?:\s*\/\s*Round\s*|\s+R)([12])\]$/i);
    if (match) {
      current = {
        agent: match[1].toLowerCase(),
        label: agentLabels.find((label) => label.toLowerCase() === match[1].toLowerCase()),
        round: Number(match[2]),
        content: '',
      };
      messages.push(current);
      continue;
    }
    if (current) current.content += `${current.content ? '\n' : ''}${line}`;
  }
  return messages;
}

function sourceHasRoundTwo(source, label) {
  const agent = label.toLowerCase();
  return sourceMessages(source).some((message) => message.agent === agent && message.round === 2);
}

function sourceCorpus(source) {
  if (typeof source === 'string') {
    return [sourceTopicText(source), sourceTranscriptText(source)].filter(Boolean).join('\n');
  }
  return [
    source?.topic || '',
    ...sourceMessages(source).map((message) => message.content || ''),
  ].join('\n');
}

export function validateIntegrationSemanticEvolution(source, content) {
  const sections = parseSections(content);
  const conflict = sections.CONFLICT || '';

  if (conflict.trim().toUpperCase() !== '- NONE OBSERVED IN TRANSCRIPT' && conflict.trim().toUpperCase() !== 'NONE OBSERVED IN TRANSCRIPT') {
    for (const line of conflictAgentLines(conflict)) {
      if (!sourceHasRoundTwo(source, line.label)) continue;
      const hasR2 = new RegExp(`\\[${line.label}\\s+R2\\]`, 'i').test(line.text);
      const hasR1 = new RegExp(`\\[${line.label}\\s+R1\\]`, 'i').test(line.text);
      if (!hasR2 || hasR1) {
        throw new Error(`Integration CONFLICT의 ${line.label}: 현재 입장은 [${line.label} R2]만 같은 Agent 줄에서 직접 인용해야 합니다. Round 2가 존재하는 Agent의 [${line.label} R1]은 CONFLICT 현재 입장 근거로 사용할 수 없습니다.`);
      }
    }
  }

  const sourceNumbers = new Set(quantitativeTokens(sourceCorpus(source)));
  const inventedNumbers = quantitativeTokens(content).filter((token) => !sourceNumbers.has(token));
  if (inventedNumbers.length) {
    throw new Error(`Integration이 transcript/user topic에 없는 정량 수치를 새로 확정했습니다: ${[...new Set(inventedNumbers)].join(', ')}. 기간·quota·threshold·가격·횟수 등 정확한 수치는 source에 있을 때만 사용할 수 있습니다.`);
  }

  return sections;
}

export function integrationSemanticInstruction() {
  return `[INTEGRATION SEMANTIC EVOLUTION RULE]\n- 현재 CONFLICT는 최신 stance만 비교하십시오. Agent에게 Round 2 발언이 존재하면 그 Agent의 World:/Revenue:/Engineering: 줄은 [Agent R2]만 직접 인용하십시오. 그 Agent의 [Agent R1]은 CONFLICT 현재 입장 근거로 쓰지 마십시오.\n- R1은 역사적 배경, FAILURE CASES, REQUIREMENTS 등의 근거로는 사용할 수 있지만 현재 unresolved/partially resolved CONFLICT를 구성하는 근거로 재활성화하지 마십시오.\n- Round 2에서 기존 R1 입장을 수정·수용·철회했다면 R2 내용을 현재 stance로 간주하십시오. 현재 R2끼리 실제로 양립하지 않을 때만 CONFLICT를 유지하십시오.\n- 한 bullet/block에서 현재 R2 수용과 과거 R1 요구처럼 서로 다른 Round의 주장을 함께 요약하면 각 주장에 해당하는 실제 Round citation을 모두 넣으십시오. R1에만 존재하는 요구를 [Agent R2]만으로 인용하거나, R2에서 수용한 현재 입장을 [Agent R1]만으로 인용하지 마십시오.\n- transcript 또는 사용자 topic에 없는 정확한 기간·quota·threshold·가격·횟수·비율 등 정량 수치를 새로 만들지 마십시오. 예: source에 없는 \"4주\", \"30일\", \"10%\"를 NEXT TEST에 넣지 마십시오. 수치가 필요하지만 source에 없으면 \"기간 미정\", \"threshold 미정\"처럼 남기십시오.`;
}
