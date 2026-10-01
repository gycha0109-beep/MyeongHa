import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITES = Object.freeze({
  runtime: Object.freeze({
    workflow: 'db-runtime-authority-suite.yml',
    postgres: 15,
  }),
  content: Object.freeze({
    workflow: 'db-content-reading-suite.yml',
    postgres: 15,
  }),
  'commerce-payment': Object.freeze({
    workflow: 'db-commerce-payment-suite.yml',
    postgres: 15,
  }),
  'commerce-entitlement': Object.freeze({
    workflow: 'db-commerce-entitlement-suite.yml',
    postgres: 15,
  }),
  postgres17: Object.freeze({
    workflow: 'db-postgres17-authority-suite.yml',
    postgres: 17,
  }),
});

const ALL_SUITES = Object.freeze(Object.keys(SUITES));

const runtimePatterns = [
  /^test\/db\/(?:birth_profile_read_runtime_authority|guest_bootstrap_runtime_authority|guest_bootstrap_current_query|records_read_runtime_authority|runtime_function_api_role_acl|self_birth_profile_current_query)\.sh$/u,
  /^test\/ops\/supabase-production-migration-repair\.sh$/u,
  /^\.github\/workflows\/(?:supabase-production|db-runtime-authority-suite)\.yml$/u,
];

const contentPatterns = [
  /^test\/db\/(?:active_default_content_release_query|character_saju_runtime_components_query|chat_thread_runtime_binding_query|episode_progress_bundle_query|outbox_success_completion_concurrency)\.sh$/u,
  /^test\/db\/reading_history_authority_query\.sql$/u,
  /^test\/db\/(?:standard_reading_artifact_reread|official_standard_reading_reader_interpretation)\.(?:sql|sh)$/u,
  /^\.github\/workflows\/db-content-reading-suite\.yml$/u,
];

const commercePaymentPatterns = [
  /^test\/db\/commerce_(?:payment|provider_payment|verified_payment)/u,
  /^apps\/api\/src\/(?:postgres-commerce-internal-execution|commerce-provider-payment-verification-context-read|commerce-verified-payment-evidence-persistence|verified-commerce-evidence)\.ts$/u,
  /^tests\/(?:postgres-commerce-internal-execution|commerce-provider-payment-verification-context-read|commerce-provider-payment-verification-context-authority|commerce-verified-payment-evidence-persistence|commerce-verified-payment-evidence-persistence-authority)\.test\.ts$/u,
  /^\.github\/workflows\/db-commerce-payment-suite\.yml$/u,
];

const commerceEntitlementPatterns = [
  /^test\/db\/(?:entitlement_|verified_receipt_capability_|commerce_entitlement_|commerce_payment_source_authority|commerce_trigger_security_hardening|effective_entitlements_|commerce_product_capability_authority|paid_general_natal_product_candidate|standard_love_relationship_reader_authority|purchase_intent_)/u,
  /^\.github\/workflows\/db-commerce-entitlement-suite\.yml$/u,
];

const postgres17Patterns = [
  /^test\/db\/(?:birth_profile_create_runtime_authority|content_release_lifecycle_authority|member_character_thread_open_concurrency)\.sh$/u,
  /^docs\/CHARACTER_GATE_B_PUBLICATION_BLOCKER_EVIDENCE\.md$/u,
  /^\.github\/workflows\/db-postgres17-authority-suite\.yml$/u,
];

const strongSharedPatterns = [
  /^test\/db\/bootstrap_supabase_auth_stub\.sql$/u,
  /^test\/db\/verify_no_schema_cardinality_hardcoding\.sh$/u,
  /^test\/db\/catalog_snapshot\.sh$/u,
  /^\.github\/workflows\/ci\.yml$/u,
  /^scripts\/ci\/db-pr-router\.mjs$/u,
];

const weakSharedPatterns = [
  /^test\/db\/run_ci_case\.sh$/u,
  /^test\/db\/catalog\.expected\.sha256$/u,
];

const matches = (path, patterns) => patterns.some((pattern) => pattern.test(path));

function addAll(selected) {
  for (const suite of ALL_SUITES) selected.add(suite);
}

function classifyMigration(path, selected) {
  const name = basename(path).toLowerCase().replace(/\.sql$/u, '');
  const tokens = new Set(name.split(/[^a-z0-9]+/u).filter(Boolean));
  const hasAny = (...values) => values.some((value) => tokens.has(value));
  let classified = false;

  if (hasAny('commerce', 'payment', 'receipt', 'purchase', 'entitlement', 'product', 'capability', 'offer')) {
    selected.add('commerce-payment');
    selected.add('commerce-entitlement');
    classified = true;
  }

  if (hasAny('character', 'chat', 'reading', 'content', 'episode', 'outbox', 'reader', 'grounding')) {
    selected.add('content');
    selected.add('postgres17');
    classified = true;
  }

  if (hasAny('birth', 'guest', 'record', 'records', 'subject', 'profile', 'auth', 'authentication', 'rls', 'privacy', 'deletion', 'memory', 'notification')) {
    selected.add('runtime');
    classified = true;
  }

  if (
    name.includes('birth_profile_create')
    || name.includes('content_release')
    || name.includes('member_character_thread')
  ) {
    selected.add('postgres17');
    classified = true;
  }

  if (!classified) addAll(selected);
}

function readSuiteCases(workflowFile) {
  const source = readFileSync(resolve('.github/workflows', workflowFile), 'utf8');
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  const marker = lines.findIndex((line) => /^\s{8}case:\s*$/u.test(line));
  if (marker < 0) {
    throw new Error(`No matrix.case list found in ${workflowFile}`);
  }

  const cases = [];
  for (let index = marker + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    const match = line.match(/^\s{10}-\s+([^#\s][^#]*?)\s*(?:#.*)?$/u);
    if (match) {
      cases.push(match[1].trim());
      continue;
    }
    if (!/^\s{10}/u.test(line)) break;
  }

  if (cases.length === 0) {
    throw new Error(`Empty matrix.case list in ${workflowFile}`);
  }

  return cases;
}

export function resolveDbPrRouting(inputPaths) {
  const paths = [...new Set(inputPaths.map((path) => path.trim()).filter(Boolean))];
  const selected = new Set();
  let weakSharedTouched = false;

  for (const path of paths) {
    if (matches(path, strongSharedPatterns)) {
      addAll(selected);
      continue;
    }

    if (matches(path, weakSharedPatterns)) {
      weakSharedTouched = true;
      continue;
    }

    if (path.startsWith('supabase/migrations/')) {
      classifyMigration(path, selected);
      continue;
    }

    if (matches(path, runtimePatterns)) selected.add('runtime');
    if (matches(path, contentPatterns)) selected.add('content');
    if (matches(path, commercePaymentPatterns)) selected.add('commerce-payment');
    if (matches(path, commerceEntitlementPatterns)) selected.add('commerce-entitlement');
    if (matches(path, postgres17Patterns)) selected.add('postgres17');
  }

  if (weakSharedTouched && selected.size === 0) addAll(selected);

  const suites = [...selected].sort();
  const pg15Cases = [];
  const pg17Cases = [];

  for (const suiteName of suites) {
    const suite = SUITES[suiteName];
    const cases = readSuiteCases(suite.workflow);
    if (suite.postgres === 17) pg17Cases.push(...cases);
    else pg15Cases.push(...cases);
  }

  return Object.freeze({
    suites,
    pg15Cases: [...new Set(pg15Cases)],
    pg17Cases: [...new Set(pg17Cases)],
  });
}

function main() {
  const paths = readFileSync(0, 'utf8').split(/\r?\n/gu);
  const routing = resolveDbPrRouting(paths);
  const pg15Enabled = routing.pg15Cases.length > 0;
  const pg17Enabled = routing.pg17Cases.length > 0;

  process.stdout.write(`db_pg15_enabled=${pg15Enabled ? 'true' : 'false'}\n`);
  process.stdout.write(`db_pg17_enabled=${pg17Enabled ? 'true' : 'false'}\n`);
  process.stdout.write(`db_pg15_cases=${JSON.stringify(pg15Enabled ? routing.pg15Cases : ['__none__'])}\n`);
  process.stdout.write(`db_pg17_cases=${JSON.stringify(pg17Enabled ? routing.pg17Cases : ['__none__'])}\n`);
  process.stdout.write(`db_suites=${JSON.stringify(routing.suites)}\n`);
}

const invokedAsScript = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) main();
