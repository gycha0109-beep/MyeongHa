import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACCOUNT_DELETION_DISPOSITION_SCHEMA_V1 =
  'myeongha-account-deletion-disposition-input-candidate-v1';
export const TRANSITIVE_SUBJECT_GRAPH_SCHEMA_V1 =
  'myeongha-transitive-subject-dependency-graph-v1';

const ALLOWED_DISPOSITIONS = new Set(['UNDECIDED', 'DELETE', 'ANONYMIZE', 'RETAIN']);

function fail(message) {
  throw new Error('Account deletion disposition contract rejected: ' + message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function edgeKey(edge) {
  return [edge.parentTable, edge.childTable, edge.constraintName].join('|');
}

export function evaluateAccountDeletionDispositionContract(contract, graph) {
  if (!isRecord(contract)) fail('contract must be an object');
  if (!isRecord(graph)) fail('graph must be an object');
  if (graph.schema !== TRANSITIVE_SUBJECT_GRAPH_SCHEMA_V1) fail('graph schema mismatch');
  if (graph.decisionId !== 'P0-PR-01') fail('graph decisionId mismatch');
  if (graph.graphAuthority !== 'SCHEMA_DISCOVERED_POLICY_NEUTRAL') {
    fail('graph authority must remain schema-discovered and policy-neutral');
  }
  if (graph.executionAuthorized !== false) fail('graph must not authorize execution');
  if (!isRecord(graph.discovery) || !Array.isArray(graph.edges)) fail('graph shape is invalid');

  const edgeKeys = new Set();
  let actualMaxDepth = 0;
  for (const edge of graph.edges) {
    if (!isRecord(edge)) fail('graph edge must be an object');
    if (!isNonEmptyString(edge.parentTable) || !isNonEmptyString(edge.childTable) || !isNonEmptyString(edge.constraintName)) {
      fail('graph edge identity is invalid');
    }
    if (!Number.isSafeInteger(edge.minDepth) || edge.minDepth < 1) fail('graph edge minDepth is invalid');
    const key = edgeKey(edge);
    if (edgeKeys.has(key)) fail('graph contains duplicate edge identity: ' + key);
    edgeKeys.add(key);
    actualMaxDepth = Math.max(actualMaxDepth, edge.minDepth);
  }

  const edgeCount = graph.edges.length;
  const expectedTables = sortedUnique(graph.edges.map((edge) => edge.childTable));
  if (graph.discovery.edgeCount !== edgeCount) fail('graph edge count metadata drifted');
  if (graph.discovery.distinctReachableTableCount !== expectedTables.length) {
    fail('graph reachable table count metadata drifted');
  }
  if (graph.discovery.maxDepth !== actualMaxDepth) fail('graph maxDepth metadata drifted');

  if (contract.schema !== ACCOUNT_DELETION_DISPOSITION_SCHEMA_V1) fail('contract schema mismatch');
  if (contract.decisionId !== 'P0-PR-01') fail('decisionId must be P0-PR-01');
  if (!['OPEN-P0', 'DECIDED'].includes(contract.decisionStatus)) fail('unsupported decisionStatus');
  if (!['NOT_APPROVED', 'APPROVED'].includes(contract.policyAuthority)) fail('unsupported policyAuthority');
  if (typeof contract.executionAuthorized !== 'boolean') fail('executionAuthorized must be boolean');
  if (!isRecord(contract.graphRef)) fail('graphRef must be an object');

  const expectedGraphRef = {
    schema: graph.schema,
    edgeCount: graph.discovery.edgeCount,
    distinctReachableTableCount: graph.discovery.distinctReachableTableCount,
    maxDepth: graph.discovery.maxDepth,
  };
  for (const [field, expected] of Object.entries(expectedGraphRef)) {
    if (contract.graphRef[field] !== expected) fail('graphRef ' + field + ' does not match the canonical graph');
  }
  const graphRefKeys = Object.keys(contract.graphRef).sort();
  if (!sameJson(graphRefKeys, Object.keys(expectedGraphRef).sort())) fail('graphRef contains unexpected fields');

  if (!Array.isArray(contract.tableDispositions)) fail('tableDispositions must be an array');
  const dispositionByTable = new Map();
  for (const entry of contract.tableDispositions) {
    if (!isRecord(entry)) fail('table disposition entry must be an object');
    if (!isNonEmptyString(entry.table)) fail('table disposition requires table');
    if (dispositionByTable.has(entry.table)) fail('duplicate table disposition: ' + entry.table);
    if (!ALLOWED_DISPOSITIONS.has(entry.disposition)) {
      fail('unsupported disposition for ' + entry.table + ': ' + String(entry.disposition));
    }
    if (entry.disposition === 'UNDECIDED') {
      if (entry.authorityReference !== null) fail('UNDECIDED authorityReference must be null: ' + entry.table);
      if (entry.retentionDurationDays !== null) fail('UNDECIDED retentionDurationDays must be null: ' + entry.table);
    } else {
      if (!isNonEmptyString(entry.authorityReference)) {
        fail('resolved disposition requires authorityReference: ' + entry.table);
      }
      if (entry.disposition === 'RETAIN') {
        if (!Number.isSafeInteger(entry.retentionDurationDays) || entry.retentionDurationDays <= 0) {
          fail('RETAIN requires positive retentionDurationDays: ' + entry.table);
        }
      } else if (entry.retentionDurationDays !== null) {
        fail(entry.disposition + ' retentionDurationDays must be null: ' + entry.table);
      }
    }
    dispositionByTable.set(entry.table, entry);
  }

  const actualTables = [...dispositionByTable.keys()].sort();
  if (!sameJson(actualTables, expectedTables)) {
    const missing = expectedTables.filter((table) => !dispositionByTable.has(table));
    const extra = actualTables.filter((table) => !expectedTables.includes(table));
    fail('table coverage mismatch missing=' + missing.join(',') + ' extra=' + extra.join(','));
  }

  if (!Array.isArray(contract.edgeConflictResolutions)) fail('edgeConflictResolutions must be an array');
  const resolutionByEdge = new Map();
  for (const resolutionEntry of contract.edgeConflictResolutions) {
    if (!isRecord(resolutionEntry)) fail('edge conflict resolution must be an object');
    const key = edgeKey(resolutionEntry);
    if (resolutionByEdge.has(key)) fail('duplicate edge conflict resolution: ' + key);
    const edge = graph.edges.find((candidate) => edgeKey(candidate) === key);
    if (!edge) fail('edge conflict resolution references unknown edge: ' + key);
    if (!isNonEmptyString(resolutionEntry.policyAuthorityReference)) {
      fail('edge conflict resolution requires policyAuthorityReference: ' + key);
    }
    if (!isNonEmptyString(resolutionEntry.executionStrategyRef)) {
      fail('edge conflict resolution requires executionStrategyRef: ' + key);
    }
    resolutionByEdge.set(key, resolutionEntry);
  }

  const unresolvedTables = expectedTables.filter(
    (table) => dispositionByTable.get(table).disposition === 'UNDECIDED',
  );
  const unresolvedEdges = [];
  const dependencyConflicts = [];
  let coveredEdgeCount = 0;

  for (const edge of graph.edges) {
    if (!dispositionByTable.has(edge.childTable)) fail('edge child table is not disposition-covered');
    coveredEdgeCount += 1;
    const childDisposition = dispositionByTable.get(edge.childTable).disposition;
    const parentEntry = dispositionByTable.get(edge.parentTable);
    const parentDisposition = parentEntry?.disposition ?? 'UNDECIDED';
    if (childDisposition === 'UNDECIDED' || parentDisposition === 'UNDECIDED') {
      unresolvedEdges.push(edgeKey(edge));
      continue;
    }
    if (childDisposition !== parentDisposition && !resolutionByEdge.has(edgeKey(edge))) {
      dependencyConflicts.push({
        edge: edgeKey(edge),
        parentDisposition,
        childDisposition,
      });
    }
  }

  for (const [key] of resolutionByEdge) {
    const edge = graph.edges.find((candidate) => edgeKey(candidate) === key);
    const parentDisposition = dispositionByTable.get(edge.parentTable)?.disposition ?? 'UNDECIDED';
    const childDisposition = dispositionByTable.get(edge.childTable).disposition;
    if (parentDisposition === 'UNDECIDED' || childDisposition === 'UNDECIDED') {
      fail('edge conflict resolution cannot pre-authorize an unresolved edge: ' + key);
    }
    if (parentDisposition === childDisposition) {
      fail('edge conflict resolution is unnecessary for equal dispositions: ' + key);
    }
  }

  const approvalFields = ['approvedPolicyVersion', 'approvedBy', 'approvedAt'];
  if (contract.decisionStatus === 'OPEN-P0') {
    if (contract.policyAuthority !== 'NOT_APPROVED') fail('OPEN-P0 policyAuthority must be NOT_APPROVED');
    if (contract.executionAuthorized !== false) fail('OPEN-P0 executionAuthorized must be false');
    for (const field of approvalFields) {
      if (contract[field] !== null) fail('OPEN-P0 ' + field + ' must be null');
    }
  } else {
    if (contract.policyAuthority !== 'APPROVED') fail('DECIDED policyAuthority must be APPROVED');
    for (const field of approvalFields) {
      if (!isNonEmptyString(contract[field])) fail('DECIDED ' + field + ' is required');
    }
  }

  if (contract.authoritativePrivacyReconciliation !== false) {
    fail('this execution-gate contract cannot promote authoritative privacy reconciliation');
  }
  if (contract.drReady !== false) fail('this execution-gate contract cannot promote drReady');

  const decisionApproved =
    contract.decisionStatus === 'DECIDED' && contract.policyAuthority === 'APPROVED';
  const policyReady =
    decisionApproved &&
    unresolvedTables.length === 0 &&
    unresolvedEdges.length === 0 &&
    dependencyConflicts.length === 0;
  if (contract.executionAuthorized && !policyReady) {
    fail('executionAuthorized=true requires an approved, complete, conflict-free policy');
  }

  return {
    schema: 'myeongha-account-deletion-disposition-readiness-v1',
    decisionId: 'P0-PR-01',
    decisionStatus: contract.decisionStatus,
    graphEdgeCount: edgeCount,
    graphReachableTableCount: expectedTables.length,
    coveredEdgeCount,
    coveredTableCount: actualTables.length,
    unresolvedTableCount: unresolvedTables.length,
    unresolvedEdgeCount: unresolvedEdges.length,
    dependencyConflictCount: dependencyConflicts.length,
    explicitConflictResolutionCount: resolutionByEdge.size,
    policyReady,
    executionAuthorized: contract.executionAuthorized,
    executionPlanAllowed: policyReady && contract.executionAuthorized,
    destructiveSqlAllowed: false,
    authoritativePrivacyReconciliation: false,
    drReady: false,
  };
}

export function buildAccountDeletionExecutionPlan(contract, graph) {
  const report = evaluateAccountDeletionDispositionContract(contract, graph);
  if (!report.executionPlanAllowed) {
    throw new Error('Account deletion execution plan generation is not authorized');
  }

  const depthByTable = new Map();
  for (const edge of graph.edges) {
    depthByTable.set(edge.childTable, Math.max(depthByTable.get(edge.childTable) ?? 0, edge.minDepth));
  }
  const dispositions = new Map(contract.tableDispositions.map((entry) => [entry.table, entry]));
  const steps = [...dispositions.values()]
    .map((entry) => ({
      table: entry.table,
      disposition: entry.disposition,
      maxDependencyDepth: depthByTable.get(entry.table) ?? 0,
      authorityReference: entry.authorityReference,
      retentionDurationDays: entry.retentionDurationDays,
    }))
    .sort((left, right) =>
      right.maxDependencyDepth - left.maxDependencyDepth || left.table.localeCompare(right.table),
    );

  return {
    schema: 'myeongha-account-deletion-execution-plan-v1',
    decisionId: 'P0-PR-01',
    approvedPolicyVersion: contract.approvedPolicyVersion,
    executionAuthorized: true,
    stepCount: steps.length,
    steps,
    destructiveSqlGenerated: false,
    sql: null,
  };
}

async function main() {
  const contractPath =
    process.argv[2] ??
    'docs/operations/ACCOUNT_DELETION_DISPOSITION_INPUT_CANDIDATE_V1.json';
  const graphPath =
    process.argv[3] ??
    'docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json';
  const [contractText, graphText] = await Promise.all([
    readFile(contractPath, 'utf8'),
    readFile(graphPath, 'utf8'),
  ]);
  const report = evaluateAccountDeletionDispositionContract(
    JSON.parse(contractText),
    JSON.parse(graphText),
  );
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
