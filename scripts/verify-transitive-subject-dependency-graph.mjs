import { readFile } from 'node:fs/promises';

const graphPath = 'docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json';
const directPath = 'docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json';
const docPath = 'docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.md';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const drStatusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [graphText, directText, doc, decisions, drStatus] = await Promise.all([
  readFile(graphPath, 'utf8'),
  readFile(directPath, 'utf8'),
  readFile(docPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(drStatusPath, 'utf8'),
]);

const graph = JSON.parse(graphText);
const direct = JSON.parse(directText);

function fail(message) {
  throw new Error('Transitive Subject dependency graph rejected: ' + message);
}

if (graph.schema !== 'myeongha-transitive-subject-dependency-graph-v1') fail('schema mismatch');
if (graph.decisionId !== 'P0-PR-01' || graph.decisionStatus !== 'OPEN-P0') {
  fail('historical schema-discovery graph must remain OPEN-P0 and policy-neutral');
}
if (graph.graphAuthority !== 'SCHEMA_DISCOVERED_POLICY_NEUTRAL') {
  fail('graph authority must remain policy-neutral');
}
for (const [field, expected] of [
  ['executionAuthorized', false],
  ['authoritativePostBackupSource', false],
  ['authoritativePrivacyReconciliation', false],
  ['futureSafePrivacyReconciliation', false],
  ['drReady', false],
]) {
  if (graph[field] !== expected) fail(field + ' must remain false');
}

if (!Array.isArray(graph.edges) || graph.edges.length !== 125) {
  fail('expected exactly 125 reachable FK edges');
}

const expectedDepthCounts = { '1': 30, '2': 44, '3': 47, '4': 4 };
if (
  graph.discovery?.edgeCount !== 125 ||
  graph.discovery?.distinctReachableTableCount !== 52 ||
  graph.discovery?.maxDepth !== 4 ||
  graph.discovery?.directDepthOneEdgeCount !== 30 ||
  JSON.stringify(graph.discovery?.depthCounts) !== JSON.stringify(expectedDepthCounts)
) {
  fail('discovery summary drifted');
}

const edgeKeys = [];
const liveDepthCounts = {};
const reachableTables = new Set();

for (const edge of graph.edges) {
  if (!edge || typeof edge !== 'object') fail('edge must be an object');
  if (!Number.isInteger(edge.minDepth) || edge.minDepth < 1 || edge.minDepth > 4) {
    fail('edge minDepth outside canonical range');
  }
  for (const field of ['parentTable', 'childTable', 'constraintName']) {
    if (typeof edge[field] !== 'string' || edge[field].trim() === '') {
      fail('edge has invalid ' + field);
    }
  }
  for (const field of ['childColumns', 'parentColumns']) {
    if (!Array.isArray(edge[field]) || edge[field].length === 0) {
      fail('edge has invalid ' + field);
    }
    if (edge[field].some((column) => typeof column !== 'string' || column.trim() === '')) {
      fail('edge contains invalid column name');
    }
  }
  if (edge.childColumns.length !== edge.parentColumns.length) {
    fail('FK child/parent column cardinality mismatch: ' + edge.constraintName);
  }
  if (edge.disposition !== 'UNDECIDED') {
    fail('all transitive edge dispositions must remain UNDECIDED');
  }

  edgeKeys.push([
    edge.minDepth,
    edge.parentTable,
    edge.childTable,
    edge.constraintName,
    edge.childColumns.join(','),
    edge.parentColumns.join(','),
  ].join('|'));
  liveDepthCounts[String(edge.minDepth)] = (liveDepthCounts[String(edge.minDepth)] ?? 0) + 1;
  reachableTables.add(edge.parentTable);
  reachableTables.add(edge.childTable);
}

if (new Set(edgeKeys).size !== 125) fail('duplicate canonical FK edge');
if (reachableTables.size !== 52) fail('expected exactly 52 reachable tables');
if (JSON.stringify(liveDepthCounts) !== JSON.stringify(expectedDepthCounts)) {
  fail('live edge depth counts drifted');
}

if (direct.schema !== 'myeongha-subject-owned-data-graph-inventory-v1') {
  fail('direct Subject inventory schema mismatch');
}
const directKeys = direct.references
  .map((entry) => entry.table + '|' + entry.column)
  .sort();
const depthOneKeys = graph.edges
  .filter((edge) => edge.minDepth === 1)
  .map((edge) => {
    if (edge.parentTable !== 'subjects' || edge.parentColumns.join(',') !== 'id') {
      fail('depth-1 edge must point directly to subjects(id)');
    }
    if (edge.childColumns.length !== 1) {
      fail('depth-1 direct Subject edge must have one child column');
    }
    return edge.childTable + '|' + edge.childColumns[0];
  })
  .sort();

if (JSON.stringify(depthOneKeys) !== JSON.stringify(directKeys)) {
  fail('depth-1 transitive graph does not exactly match #1063 direct Subject inventory');
}

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  fail('decision register must record P0-PR-01 as DECIDED while this graph remains policy-neutral');
}

for (const fragment of [
  'SCHEMA-DISCOVERED TRANSITIVE COVERAGE / POLICY NEUTRAL / EXECUTION NOT AUTHORIZED',
  'reachable FK edges         = 125',
  'distinct reachable tables  = 52',
  'maximum minimum depth      = 4',
  'depth 1 = 30',
  'depth 2 = 44',
  'depth 3 = 47',
  'depth 4 = 4',
  'disposition = UNDECIDED',
]) {
  if (!doc.includes(fragment)) fail('documentation boundary missing: ' + fragment);
}

for (const fragment of [
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'privacy_reconciliation: BLOCKED_BY_FRESH_RESTORE_RUNTIME_AND_APPLICABLE_AUTHORITATIVE_DELTA_PROOF',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]) {
  if (!drStatus.includes(fragment)) {
    fail('DR authority drifted after P0-PR-01 approval: ' + fragment);
  }
}

console.log(
  'Transitive Subject dependency graph historical coverage PASS: 125 reachable FK edges across 52 tables, depths 30/44/47/4, exact depth-1 parity with #1063; schema graph stays policy-neutral while approved dispositions live separately.',
);
