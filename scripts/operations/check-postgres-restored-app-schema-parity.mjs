// Phase 8-A: current Production app catalog vs isolated restored PG17 catalog.
// Metadata digests only; no Production writes, raw SQL bodies, or personal data.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schemaVersion = 'ops-postgres-application-schema-fingerprint-v1';
const migrationFragment = [
  "'migrationCatalog',pg_catalog.jsonb_build_object(",
  "   'totalVersions',(SELECT count(*) FROM supabase_migrations.schema_migrations),",
  "   'latestVersion',(SELECT max(version) FROM supabase_migrations.schema_migrations)",
  " )",
].join('\n');

export function buildRestoredReadOnlyQuery(sourceQuery) {
  assert.match(sourceQuery, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sourceQuery, /ROLLBACK;\s*$/);
  assert.equal(sourceQuery.split(migrationFragment).length, 2,
    'Reviewed source SQL migration clause changed; do not infer parity');
  // The portable backup excludes the Supabase-managed migration ledger.
  // Only remove the direct provider ledger dependency, never fabricate rows.
  return sourceQuery.replace(migrationFragment, [
    "'migrationCatalog',pg_catalog.jsonb_build_object(",
    "   'totalVersions',null,",
    "   'latestVersion',null",
    " )",
  ].join('\n'));
}

const kinds = {
  schemas: {
    identity: row => row.schema_name,
    fields: ['owner_name', 'acl_sha256'],
  },
  tables: {
    identity: row => row.schema_name + '.' + row.table_name,
    fields: [
      'owner_name', 'rls_enabled', 'rls_forced', 'column_count', 'index_count',
      'user_trigger_count', 'constraint_count', 'policy_count', 'structural_sha256',
    ],
  },
  functions: {
    identity: row => row.schema_name + '.' + row.function_name +
      '(' + row.identity_arguments + ')',
    fields: [
      'owner_name', 'security_definer', 'volatility', 'function_config',
      'full_definition_sha256', 'acl_sha256',
    ],
  },
};

const tableComponentNames = [
  'columns', 'constraints', 'indexes', 'triggers', 'policies', 'acl',
  'reloptions', 'persistence', 'rowSecurityEnabled', 'rowSecurityForced',
];
const digestPattern = /^[0-9a-f]{64}$/;

function assertDigest(value, label) {
  assert.match(value, digestPattern, label + ' requires SHA-256');
}

function componentDifferences(source, restored) {
  const before = source.structural_component_sha256;
  if (before === undefined) return null; // Existing encrypted archives predate facets.
  const after = restored.structural_component_sha256;
  for (const [side, value] of [['source', before], ['restored', after]]) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value),
      side + ' table component hashes must be a JSON object');
    assert.deepEqual(Object.keys(value).sort(), [...tableComponentNames].sort(),
      side + ' table component hash fields changed');
    for (const key of tableComponentNames) assertDigest(value[key], side + ':' + key);
  }
  const differences = tableComponentNames.filter(key => before[key] !== after[key]);
  assert.equal(differences.length === 0,
    source.structural_sha256 === restored.structural_sha256,
    'Component and aggregate structural digests contradict one another');
  return differences;
}

function aclDifferenceScope(source, restored) {
  const before = source.acl_grant_entries_without_grantor_sha256;
  if (before === undefined) return null; // Older encrypted evidence remains valid.
  const after = restored.acl_grant_entries_without_grantor_sha256;
  assertDigest(before, 'source grant-entry digest');
  assertDigest(after, 'restored grant-entry digest');
  if (source.acl_sha256 === restored.acl_sha256) {
    assert.equal(before, after, 'Same full ACL but different grant-entry digest');
    return 'MATCH';
  }
  return before === after
    ? 'GRANTOR_ATTRIBUTION_ONLY'
    : 'GRANT_ENTRIES_DIFFER';
}

function aclByGranteeDifferences(source, restored) {
  const before = source.acl_by_grantee_privilege_sha256;
  if (before === undefined) return null; // Older sealed archives.
  const after = restored.acl_by_grantee_privilege_sha256;
  for (const [side, map] of [['source', before], ['restored', after]]) {
    assert.ok(map && typeof map === 'object' && !Array.isArray(map),
      side + ' grantee privilege digests must be a JSON object');
    for (const [role, digest] of Object.entries(map)) {
      assert.ok(role.length > 0 && role.length <= 160 &&
        !/[\r\n\t]/u.test(role), side + ' malformed grantee role');
      assertDigest(digest, side + ':' + role);
    }
  }
  const affected = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(role => before[role] !== after[role]).sort();
  if (source.acl_sha256 !== undefined && restored.acl_sha256 !== undefined &&
      source.acl_sha256 === restored.acl_sha256) {
    assert.equal(affected.length, 0,
      'Unchanged full ACL digest contradicts grantee privilege digests');
  }
  if (source.acl_grant_entries_without_grantor_sha256 !== undefined &&
      source.acl_grant_entries_without_grantor_sha256 ===
        restored.acl_grant_entries_without_grantor_sha256) {
    assert.equal(affected.length, 0,
      'Unchanged grant entries contradict grantee privilege digests');
  }
  return affected;
}

function canonicalGrantorDifferences(source, restored, directRoles) {
  const before = source.acl_by_grantee_grantor_privilege_sha256;
  if (before === undefined) return null; // Previous sealed archives stay comparable.
  const after = restored.acl_by_grantee_grantor_privilege_sha256;
  for (const [side, map] of [['source', before], ['restored', after]]) {
    assert.ok(map && typeof map === 'object' && !Array.isArray(map),
      side + ' canonical grantor map must be an object');
    for (const [grantee, digest] of Object.entries(map)) {
      assert.ok(grantee.length > 0 && grantee.length <= 160 &&
        !/[\r\n\t]/u.test(grantee), side + ' malformed grantee name');
      assertDigest(digest, side + ':grantor:' + grantee);
    }
  }
  const affected = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(grantee => before[grantee] !== after[grantee]).sort();
  // A canonical grantor-aware entry includes the grantee's permission entry.
  if (directRoles !== null) {
    for (const grantee of directRoles) {
      assert.ok(affected.includes(grantee),
        'Changed direct privileges cannot have an unchanged grantor-aware digest');
    }
  }
  if (source.acl_sha256 !== undefined && restored.acl_sha256 !== undefined &&
      source.acl_sha256 === restored.acl_sha256) {
    assert.equal(affected.length, 0,
      'Unchanged full ACL contradicts canonical grantor-aware digests');
  }
  return affected;
}

function assertUniformFacetCoverage(rows, kind, field) {
  const present = rows.filter(row => row[field] !== undefined).length;
  assert.ok(present === 0 || present === rows.length,
    'Source ' + kind + ' facet digest coverage must be all or none');
  return present === rows.length;
}

function indexed(rows, kind, definition) {
  assert.ok(Array.isArray(rows), kind + ' must be an array');
  const map = new Map();
  for (const item of rows) {
    const key = definition.identity(item);
    assert.ok(typeof key === 'string' && key.length > 0);
    assert.ok(!map.has(key), 'Duplicate ' + kind + ' identity: ' + key);
    map.set(key, item);
  }
  return map;
}

function sourceCatalogWitness(source) {
  // A backup-run bracket is stronger evidence than a separate date-only
  // observation, but it is NOT a shared PostgreSQL MVCC snapshot.
  if (source.sourceCatalogProvenance === undefined) {
    for (const key of ['sourceCatalogBracketStable', 'sourceCatalogBracketStartUtc',
      'sourceCatalogBracketEndUtc', 'sourceCatalogBoundToBackupSnapshot']) {
      assert.ok(!(key in source), 'Legacy observation has unexpected witness field: ' + key);
    }
    return {
      provenance: 'legacy_date_only_observation',
      hold: 'SOURCE_OBSERVATION_DATE_ONLY_NO_BACKUP_SNAPSHOT_WITNESS',
    };
  }
  assert.equal(source.sourceCatalogProvenance, 'encrypted_backup_bracketed_readonly_v1');
  assert.equal(source.sourceCatalogBracketStable, true);
  assert.equal(source.sourceCatalogBoundToBackupSnapshot, false);
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  assert.match(source.sourceCatalogBracketStartUtc, utc);
  assert.match(source.sourceCatalogBracketEndUtc, utc);
  assert.ok(source.sourceCatalogBracketStartUtc <= source.sourceCatalogBracketEndUtc,
    'Backup witness observation bracket must be ordered');
  return {
    provenance: source.sourceCatalogProvenance,
    hold: 'SOURCE_BACKUP_EXECUTION_BRACKETED_NO_SHARED_MVCC_SNAPSHOT',
  };
}

// Direct internal application role graph only. Provider-managed role edges,
// inherited effective access, and portable replay provenance are NOT covered.
const roleGraphScope = 'myeongha_to_myeongha_direct_membership_only_v1';
const applicationRolePattern = /^myeongha_[a-z0-9_]+$/u;
const roleAttributeFields = [
  'superuser', 'inherit', 'create_role', 'create_database', 'can_login',
  'replication', 'bypass_rls', 'connection_limit',
];
const membershipOptionFields = ['admin_option', 'inherit_option', 'set_option'];

function validateRoleGraph(graph, side) {
  assert.ok(graph && typeof graph === 'object' && !Array.isArray(graph),
    side + ' role graph must be an object');
  assert.equal(graph.scope, roleGraphScope);
  assert.equal(graph.providerBoundaryMembershipsIncluded, false,
    'Full provider role membership cannot be assumed');
  assert.ok(Array.isArray(graph.roles) && graph.roles.length > 0);
  assert.ok(Array.isArray(graph.directMemberships));
  const roles = new Map();
  for (const item of graph.roles) {
    assert.ok(applicationRolePattern.test(item.role_name), 'Invalid application role');
    for (const field of roleAttributeFields) {
      if (field === 'connection_limit') {
        assert.ok(Number.isInteger(item[field]), 'Role connection limit must be integer');
      } else {
        assert.equal(typeof item[field], 'boolean', 'Invalid application role flag: ' + field);
      }
    }
    assert.ok(!roles.has(item.role_name), 'Duplicate application role');
    roles.set(item.role_name, item);
  }
  const seen = new Set();
  const membershipCore = new Map();
  for (const item of graph.directMemberships) {
    assert.ok(roles.has(item.granted_role) && roles.has(item.member_role),
      'Direct role edge is outside explicit application role inventory');
    assert.ok(typeof item.grantor_name === 'string' &&
      item.grantor_name.length > 0 && item.grantor_name.length <= 160 &&
      !/[\r\n\t]/u.test(item.grantor_name), 'Invalid membership grantor');
    for (const field of membershipOptionFields) {
      assert.equal(typeof item[field], 'boolean', 'Invalid membership option: ' + field);
    }
    const exact = JSON.stringify([item.granted_role, item.member_role,
      item.grantor_name]);
    assert.ok(!seen.has(exact), 'Duplicate grantor-specific membership row');
    seen.add(exact);
    const key = JSON.stringify([item.granted_role, item.member_role,
      ...membershipOptionFields.map(field => item[field])]);
    const grantors = membershipCore.get(key) ?? [];
    grantors.push(item.grantor_name);
    membershipCore.set(key, grantors);
  }
  for (const grantors of membershipCore.values()) grantors.sort();
  return { graph, roles, membershipCore };
}

export function observeApplicationDirectRoleGraph(source, restored) {
  if (source.applicationRoleGraph === undefined) {
    return { sourceWitnessAvailable: false, observedMembershipOptionsParity: false,
      observedGrantorAttributionParity: false,
      observedPortableGrantorRewriteCompatibility: null, scope: roleGraphScope,
      providerBoundaryMembershipsIncluded: false, details: null };
  }
  const before = validateRoleGraph(source.applicationRoleGraph, 'source');
  const after = validateRoleGraph(restored.applicationRoleGraph, 'restored');
  const missingRoleCount = [...before.roles.keys()].filter(x => !after.roles.has(x)).length;
  const addedRoleCount = [...after.roles.keys()].filter(x => !before.roles.has(x)).length;
  const roleAttributesDifferentCount = [...before.roles].filter(([name, role]) =>
    after.roles.has(name) && roleAttributeFields.some(field =>
      role[field] !== after.roles.get(name)[field])).length;
  let missingMembershipEntryCount = 0;
  let addedMembershipEntryCount = 0;
  let grantorAttributionDifferenceGroupCount = 0;
  let portablePostgresGrantorRewriteCompatibleGroupCount = 0;
  let unexplainedGrantorAttributionDifferenceGroupCount = 0;
  for (const [key, grantors] of before.membershipCore) {
    const next = after.membershipCore.get(key) ?? [];
    if (grantors.length > next.length) {
      missingMembershipEntryCount += grantors.length - next.length;
    }
    if (grantors.length < next.length) {
      addedMembershipEntryCount += next.length - grantors.length;
    }
    if (grantors.length === next.length && JSON.stringify(grantors) !==
      JSON.stringify(next)) {
      grantorAttributionDifferenceGroupCount++;
      // Portable roles.sql replay removes only an exact GRANTED BY postgres
      // on a MyeongHa-to-MyeongHa membership, then re-grants the unchanged
      // options as isolated supabase_admin. Compare EACH membership key.
      // This is diagnostic compatibility, never identical grantor provenance.
      const expectedPortableGrantors = grantors.map(grantor =>
        grantor === 'postgres' ? 'supabase_admin' : grantor).sort();
      if (grantors.includes('postgres') &&
        JSON.stringify(expectedPortableGrantors) === JSON.stringify(next)) {
        portablePostgresGrantorRewriteCompatibleGroupCount++;
      } else {
        unexplainedGrantorAttributionDifferenceGroupCount++;
      }
    }
  }
  for (const [key, grantors] of after.membershipCore) {
    if (!before.membershipCore.has(key)) addedMembershipEntryCount += grantors.length;
  }
  const observedMembershipOptionsParity =
    missingRoleCount === 0 && addedRoleCount === 0 &&
    roleAttributesDifferentCount === 0 && missingMembershipEntryCount === 0 &&
    addedMembershipEntryCount === 0;
  return {
    sourceWitnessAvailable: true,
    scope: roleGraphScope,
    providerBoundaryMembershipsIncluded: false,
    observedMembershipOptionsParity,
    observedGrantorAttributionParity: observedMembershipOptionsParity &&
      grantorAttributionDifferenceGroupCount === 0,
    // Null means no drift to classify. True means every changed membership
    // group matches the reviewed portable postgres -> supabase_admin rewrite,
    // NOT that Production grantor attribution was restored.
    observedPortableGrantorRewriteCompatibility:
      grantorAttributionDifferenceGroupCount === 0 ? null :
        (observedMembershipOptionsParity &&
        unexplainedGrantorAttributionDifferenceGroupCount === 0),
    details: {
      sourceRoleCount: before.roles.size,
      restoredRoleCount: after.roles.size,
      sourceDirectMembershipCount: before.graph.directMemberships.length,
      restoredDirectMembershipCount: after.graph.directMemberships.length,
      missingRoleCount, addedRoleCount, roleAttributesDifferentCount,
      missingMembershipEntryCount, addedMembershipEntryCount,
      grantorAttributionDifferenceGroupCount,
      portablePostgresGrantorRewriteCompatibleGroupCount,
      unexplainedGrantorAttributionDifferenceGroupCount,
    },
  };
}

// This catalog-only inventory includes a direct edge if exactly one endpoint
// is a MyeongHa application role. "External" is NOT an authenticated claim
// that the other endpoint is provider-owned. Inherited and effective rights
// are deliberately outside this diagnostic and remain unproven.
const externalBoundaryScope =
  'myeongha_to_non_myeongha_direct_membership_only_v1';

function validateApplicationExternalRoleBoundary(graph, side) {
  assert.ok(graph && typeof graph === 'object' && !Array.isArray(graph),
    side + ' external boundary must be an object');
  assert.equal(graph.scope, externalBoundaryScope);
  assert.equal(graph.providerOwnedOnlyProven, false);
  assert.equal(graph.inheritedEffectiveAccessIncluded, false);
  assert.ok(Array.isArray(graph.directMemberships),
    side + ' external membership inventory must be an array');
  const core = new Map();
  const seen = new Set();
  const externalRoles = new Set();
  for (const item of graph.directMemberships) {
    for (const roleName of [item.granted_role, item.member_role,
      item.grantor_name]) {
      assert.ok(typeof roleName === 'string' &&
        roleName.length > 0 && roleName.length <= 160 &&
        !/[\r\n\t]/u.test(roleName),
      'Invalid external role membership name');
    }
    const grantedIsApplication = applicationRolePattern.test(item.granted_role);
    const memberIsApplication = applicationRolePattern.test(item.member_role);
    assert.notEqual(grantedIsApplication, memberIsApplication,
      'External role edge must cross exactly one application role boundary');
    externalRoles.add(grantedIsApplication ? item.member_role : item.granted_role);
    for (const field of membershipOptionFields) {
      assert.equal(typeof item[field], 'boolean',
        'Invalid external role membership option: ' + field);
    }
    const exact = JSON.stringify([item.granted_role, item.member_role,
      item.grantor_name]);
    assert.ok(!seen.has(exact), 'Duplicate external grantor membership');
    seen.add(exact);
    const key = JSON.stringify([item.granted_role, item.member_role,
      ...membershipOptionFields.map(field => item[field])]);
    const grantors = core.get(key) ?? [];
    grantors.push(item.grantor_name);
    core.set(key, grantors);
  }
  for (const grantors of core.values()) grantors.sort();
  return { graph, core, externalRoles };
}

export function observeApplicationExternalRoleBoundary(source, restored) {
  if (source.applicationExternalRoleBoundary === undefined) {
    return {
      sourceWitnessAvailable: false,
      scope: externalBoundaryScope,
      providerOwnedOnlyProven: false,
      inheritedEffectiveAccessIncluded: false,
      observedDirectMembershipOptionParity: false,
      observedGrantorAttributionParity: false,
      details: null,
    };
  }
  const before = validateApplicationExternalRoleBoundary(
    source.applicationExternalRoleBoundary, 'source');
  const after = validateApplicationExternalRoleBoundary(
    restored.applicationExternalRoleBoundary, 'restored');
  let missingMembershipOptionEntryCount = 0;
  let addedMembershipOptionEntryCount = 0;
  let grantorAttributionDifferenceGroupCount = 0;
  for (const [key, grantors] of before.core) {
    const next = after.core.get(key) ?? [];
    missingMembershipOptionEntryCount += Math.max(0, grantors.length - next.length);
    addedMembershipOptionEntryCount += Math.max(0, next.length - grantors.length);
    if (grantors.length === next.length &&
      JSON.stringify(grantors) !== JSON.stringify(next)) {
      grantorAttributionDifferenceGroupCount++;
    }
  }
  for (const [key, grantors] of after.core) {
    if (!before.core.has(key)) {
      addedMembershipOptionEntryCount += grantors.length;
    }
  }
  const observedDirectMembershipOptionParity =
    missingMembershipOptionEntryCount === 0 &&
    addedMembershipOptionEntryCount === 0;
  return {
    sourceWitnessAvailable: true,
    scope: externalBoundaryScope,
    providerOwnedOnlyProven: false,
    inheritedEffectiveAccessIncluded: false,
    observedDirectMembershipOptionParity,
    observedGrantorAttributionParity: observedDirectMembershipOptionParity &&
      grantorAttributionDifferenceGroupCount === 0,
    details: {
      sourceDirectMembershipCount: before.graph.directMemberships.length,
      restoredDirectMembershipCount: after.graph.directMemberships.length,
      sourceReferencedExternalRoleCount: before.externalRoles.size,
      restoredReferencedExternalRoleCount: after.externalRoles.size,
      missingMembershipOptionEntryCount,
      addedMembershipOptionEntryCount,
      grantorAttributionDifferenceGroupCount,
    },
  };
}

export function compareApplicationCatalog(source, restored, backupFrontier) {
  const sourceWitness = sourceCatalogWitness(source);
  assert.equal(source.schemaVersion, schemaVersion);
  assert.equal(restored.schemaVersion, schemaVersion);
  assert.equal(source.transactionReadOnly, 'on');
  assert.equal(restored.transactionReadOnly, 'on');
  assert.match(source.postgresqlVersion, /^17\./);
  assert.match(restored.postgresVersion, /^17\./);
  assert.ok(source.migrationCatalog?.latestVersion);
  assert.ok(Number.isInteger(source.migrationCatalog?.totalVersions));
  assert.equal(restored.migrationCatalog?.latestVersion, null,
    'Do not claim a restored Supabase migration ledger');
  assert.equal(restored.migrationCatalog?.totalVersions, null);
  const migrationFrontierAligned =
    String(source.migrationCatalog.latestVersion) === String(backupFrontier);
  const byType = {};
  if (source.applicationRoleGraph !== undefined) {
    assert.equal(sourceWitness.provenance, 'encrypted_backup_bracketed_readonly_v1',
      'Application role graph requires a sealed backup-run source witness');
  }
  const observedApplicationDirectRoleGraph =
    observeApplicationDirectRoleGraph(source, restored);
  if (source.applicationExternalRoleBoundary !== undefined) {
    assert.equal(sourceWitness.provenance, 'encrypted_backup_bracketed_readonly_v1',
      'External role boundary requires a sealed backup-run source witness');
  }
  const observedApplicationExternalRoleBoundary =
    observeApplicationExternalRoleBoundary(source, restored);
  const componentHashEvidence = {
    tableStructure: assertUniformFacetCoverage(source.tables, 'tables',
      'structural_component_sha256'),
    schemaAclGrantEntries: assertUniformFacetCoverage(source.schemas, 'schemas',
      'acl_grant_entries_without_grantor_sha256'),
    routineAclGrantEntries: assertUniformFacetCoverage(source.functions, 'functions',
      'acl_grant_entries_without_grantor_sha256'),
    tableAclByGrantee: assertUniformFacetCoverage(source.tables, 'tables',
      'acl_by_grantee_privilege_sha256'),
    schemaAclByGrantee: assertUniformFacetCoverage(source.schemas, 'schemas',
      'acl_by_grantee_privilege_sha256'),
    routineAclByGrantee: assertUniformFacetCoverage(source.functions, 'functions',
      'acl_by_grantee_privilege_sha256'),
    tableAclGrantorByGrantee: assertUniformFacetCoverage(source.tables, 'tables',
      'acl_by_grantee_grantor_privilege_sha256'),
    schemaAclGrantorByGrantee: assertUniformFacetCoverage(source.schemas, 'schemas',
      'acl_by_grantee_grantor_privilege_sha256'),
    routineAclGrantorByGrantee: assertUniformFacetCoverage(source.functions, 'functions',
      'acl_by_grantee_grantor_privilege_sha256'),
  };
  for (const [kind, definition] of Object.entries(kinds)) {
    const before = indexed(source[kind], kind, definition);
    const after = indexed(restored[kind], kind, definition);
    const missing = [], additional = [], changed = [];
    for (const [identity, value] of before) {
      const matched = after.get(identity);
      if (!matched) {
        missing.push(identity);
        continue;
      }
      const differingFields = definition.fields.filter(field =>
        JSON.stringify(value[field]) !== JSON.stringify(matched[field]));
      // Validate facet / aggregate consistency even when the aggregate matches.
      const parts = kind === 'tables' ? componentDifferences(value, matched) : null;
      const scope = kind === 'schemas' || kind === 'functions'
        ? aclDifferenceScope(value, matched) : null;
      const roles = aclByGranteeDifferences(value, matched);
      const grantorGrantees = canonicalGrantorDifferences(value, matched, roles);
      if (grantorGrantees?.length && kind === 'tables') {
        assert.ok(parts?.includes('acl') && differingFields.includes('structural_sha256'),
          'Canonical table grantor difference lacks aggregate ACL difference');
      }
      if (grantorGrantees?.length && kind !== 'tables') {
        assert.ok(differingFields.includes('acl_sha256'),
          'Canonical function/schema grantor difference lacks aggregate ACL difference');
      }
      if (roles?.length && kind === 'tables') {
        assert.ok(parts?.includes('acl') && differingFields.includes('structural_sha256'),
          'Changed table grantee privileges lack a table ACL digest difference');
      }
      if (roles?.length && kind !== 'tables') {
        assert.ok(differingFields.includes('acl_sha256'),
          'Changed grantee privileges lack a schema/function ACL difference');
      }
      if (differingFields.length) {
        const detail = { object: identity, differingFields };
        if (parts !== null && differingFields.includes('structural_sha256')) {
          detail.structuralComponentDifferences = parts;
        }
        if (scope !== null && differingFields.includes('acl_sha256')) {
          detail.aclDifferenceScope = scope;
        }
        if (roles !== null && (kind === 'tables' ? parts?.includes('acl') :
          differingFields.includes('acl_sha256'))) {
          // Scope direct per-grantee grant entries, not inherited effective access.
          // The legacy aggregate ACL digest sorts entries by role OIDs, which
          // may differ across isolated clusters. A digest mismatch with no
          // grantee delta is NOT proof of a changed permission or grantor.
          // Role identifiers only; never raw source grants or SQL bodies.
          detail.aclAffectedGrantees = roles;
          detail.aclGranteePrivilegeVerdict = roles.length
            ? 'DIFFERENT_DIRECT_GRANTEE_PRIVILEGES'
            : 'MATCH_DIRECT_GRANTEE_PRIVILEGES_ACL_HASH_DIFFERS';
        }
        if (grantorGrantees !== null && (kind === 'tables' ?
          parts?.includes('acl') : differingFields.includes('acl_sha256'))) {
          detail.aclCanonicalGrantorChangedGrantees = grantorGrantees;
          // Even with canonical agreement, never infer an authenticated
          // Provider/Hosted restore, effective inherited rights or DR ready.
          detail.aclCanonicalGrantorVerdict = grantorGrantees.length
            ? 'DIFFERENT_CANONICAL_GRANTOR_ENTRIES'
            : 'MATCH_CANONICAL_GRANTOR_ENTRIES_LEGACY_ACL_HASH_DIFFERS';
        }
        changed.push(detail);
      }
    }
    for (const identity of after.keys()) {
      if (!before.has(identity)) additional.push(identity);
    }
    byType[kind] = {
      baselineCount: before.size,
      restoredCount: after.size,
      missing: missing.sort(),
      additional: additional.sort(),
      changed: changed.sort((a, b) => a.object.localeCompare(b.object)),
      matchingCount: before.size - missing.length - changed.length,
    };
  }
  const versionEqual = source.postgresqlVersion === restored.postgresVersion;
  const scopeMatched = Object.values(byType).every(t =>
    !t.missing.length && !t.additional.length && !t.changed.length);
  const verifiedApplicationScopeEquivalence =
    migrationFrontierAligned && versionEqual && scopeMatched;

  // Never erase original legacy hash differences. When a source catalog
  // sealed during this backup execution has ALL canonical facets, we can
  // *separately* report observed equality of app DDL + direct ACL entries
  // and grantor attribution, without claiming the pg_dump MVCC snapshot,
  // inherited effective permissions, provider ledger, or recovered serving.
  const canonicalAclCoverageComplete =
    sourceWitness.provenance === 'encrypted_backup_bracketed_readonly_v1' &&
    Object.values(componentHashEvidence).every(Boolean);
  const canonicalAclLegacyHashOnlyByKind = {};
  const canonicalAclUnresolvedByKind = {};
  for (const [kind, evidence] of Object.entries(byType)) {
    const isSafeLegacyHashDifference = row =>
      row.aclGranteePrivilegeVerdict ===
        'MATCH_DIRECT_GRANTEE_PRIVILEGES_ACL_HASH_DIFFERS' &&
      row.aclCanonicalGrantorVerdict ===
        'MATCH_CANONICAL_GRANTOR_ENTRIES_LEGACY_ACL_HASH_DIFFERS' &&
      Array.isArray(row.aclAffectedGrantees) &&
      row.aclAffectedGrantees.length === 0 &&
      Array.isArray(row.aclCanonicalGrantorChangedGrantees) &&
      row.aclCanonicalGrantorChangedGrantees.length === 0 &&
      (kind === 'tables'
        ? row.differingFields.length === 1 &&
          row.differingFields[0] === 'structural_sha256' &&
          row.structuralComponentDifferences?.length === 1 &&
          row.structuralComponentDifferences[0] === 'acl'
        : row.differingFields.length === 1 &&
          row.differingFields[0] === 'acl_sha256');
    const ignorable = canonicalAclCoverageComplete
      ? evidence.changed.filter(isSafeLegacyHashDifference).length
      : 0;
    canonicalAclLegacyHashOnlyByKind[kind] = ignorable;
    canonicalAclUnresolvedByKind[kind] = evidence.changed.length - ignorable +
      evidence.missing.length + evidence.additional.length;
  }
  const observedCanonicalApplicationCatalogParity =
    canonicalAclCoverageComplete && migrationFrontierAligned && versionEqual &&
    Object.values(canonicalAclUnresolvedByKind).every(count => count === 0);
  return {
    schemaVersion: 'ops-postgres-restored-app-catalog-comparison-v1',
    sourceObservationDateKst: source.observedKstDate,
    sourceMigrationFrontier: String(source.migrationCatalog.latestVersion),
    isolatedBackupMigrationFrontier: String(backupFrontier),
    sourceMigrationCatalogVersionCount: source.migrationCatalog.totalVersions,
    migrationFrontierAligned,
    postgresVersionEqual: versionEqual,
    // A sealed before/after source witness is tied to the backup execution,
    // unlike the legacy date-only reference. Neither shares the pg_dump MVCC
    // snapshot, so later DDL, portable restore losses, or ACL grantor drift
    // cannot be causally attributed from this report alone.
    sourceCatalogBoundToBackupSnapshot: false,
    restoreMismatchRootCauseProven: false,
    sourceCatalogProvenance: sourceWitness.provenance,
    sourceCatalogProvenanceHold: sourceWitness.hold,
    sourcePostgresVersion: source.postgresqlVersion,
    restoredPostgresVersion: restored.postgresVersion,
    comparedScope: source.coverage,
    // New sealed catalogs can locate each structural/ACL facet without
    // disclosing raw definitions, grantors, row payloads or credentials.
    // Old sealed/legacy catalogs have no such evidence: never infer a cause.
    componentHashEvidence,
    // Read-only, sealed application-owned role edges only. Provider/Hosted
    // membership and inherited effective access remain unverified.
    observedApplicationDirectRoleGraph,
    // External-role boundary means any non-MyeongHa endpoint, not verified
    // provider ownership. Count-only output; raw role edges stay encrypted.
    observedApplicationExternalRoleBoundary,
    // A diagnostic observation, NOT a migration/DR/provider acceptance gate.
    // The original applicationScopeVerdict below remains fail-closed on any
    // legacy hash mismatch; this evidence does not waive it.
    observedCanonicalAclCatalog: {
      witnessComplete: canonicalAclCoverageComplete,
      observedApplicationCatalogParity: observedCanonicalApplicationCatalogParity,
      legacyHashOnlyByKind: canonicalAclCoverageComplete
        ? canonicalAclLegacyHashOnlyByKind : null,
      unresolvedByKind: canonicalAclCoverageComplete
        ? canonicalAclUnresolvedByKind : null,
    },
    types: byType,
    applicationScopeVerdict: !migrationFrontierAligned
      ? 'HOLD_SOURCE_BACKUP_FRONTIER_MISMATCH'
      : (!versionEqual || !scopeMatched)
        ? 'HOLD_APPLICATION_SCHEMA_PARITY_MISMATCH'
        : 'MATCH_APPLICATION_CATALOG_ONLY',
    verifiedApplicationScopeEquivalence,
    // Source snapshot and portable archive do NOT cover all managed schemas,
    // role memberships, provider migration ledger, or Hosted Auth/Storage.
    verifiedFullSchemaCatalogEquivalence: false,
    fullSupabaseMigrationLedgerRestored: false,
    providerManagedDataFullRestore: false,
    hostedAuthStorageEquivalent: false,
    roleMembershipParityProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(argv[i]?.startsWith('--') && argv[i + 1], 'Invalid CLI arguments');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['source', 'query', 'restore-evidence', 'output']) {
    assert.ok(result[key], 'Missing --' + key);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await readFile(args.source, 'utf8'));
  const restoreEvidence = JSON.parse(await readFile(args['restore-evidence'], 'utf8'));
  assert.ok(restoreEvidence.backup_migration_frontier,
    'Restore evidence missing backup migration frontier');
  const query = buildRestoredReadOnlyQuery(await readFile(args.query, 'utf8'));
  const proc = spawnSync('psql',
    ['-X', '-q', '-A', '-t', '--set', 'ON_ERROR_STOP=1', '--file', '-'], {
      input: query,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
  if (proc.error || proc.status !== 0) {
    throw new Error('Isolated read-only catalog query failed: ' +
      (proc.error?.message || proc.stderr?.slice(0, 1000) || proc.status));
  }
  const restored = JSON.parse(proc.stdout.trim());
  const report = compareApplicationCatalog(
    source, restored, restoreEvidence.backup_migration_frontier);
  await writeFile(args.output, JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 });
  const totals = Object.entries(report.types).map(([kind, value]) =>
    kind + '=' + value.matchingCount + '/' + value.baselineCount).join(', ');
  console.log('Phase 8-A catalog: ' + report.applicationScopeVerdict +
    ' (' + totals + '); DR serving BLOCKED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('Phase 8-A restored catalog comparison error: ' + error.message);
    process.exitCode = 1;
  });
}
