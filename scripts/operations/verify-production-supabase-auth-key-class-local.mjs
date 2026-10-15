#!/usr/bin/env node
// D3e26 local-only Production environment attestation.
// Reads the active process environment *in memory*. It does NOT access
// Vercel/Supabase APIs, read .env files, print secrets, or make HTTP requests.
// Requires Node >=24 (native TypeScript type-stripping for the shared policy).
import { classifySupabaseAuthApiKeyV1 } from '../../apps/api/src/supabase-auth-api-key-least-privilege.ts';

const EXPECTED_ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const EXPECTED_LOGIN = 'myeongha_runtime';

function reportHold(reason) {
  // All reason strings are internal enum labels, never derived from env values.
  console.error('HOLD D3e26: ' + reason + '. No release authorization.');
  process.exitCode = 2;
}

if (process.argv.length !== 2) {
  // In particular, never pass an API key as a CLI argument: process arguments
  // can be visible to other users on the host.
  reportHold('command_arguments_not_accepted');
} else {
  const apiKey = process.env.MYEONGHA_SUPABASE_API_KEY;
  const classification = classifySupabaseAuthApiKeyV1(apiKey);
  const allowed = classification === 'publishable' || classification === 'legacy_anon';

  // These nonsecret identifiers must match the already-reviewed deployment
  // configuration, but a match is NOT proof of running DB session identity.
  const originMatches = process.env.MYEONGHA_SUPABASE_URL === EXPECTED_ORIGIN;
  const principalMatches =
    process.env.MYEONGHA_DATABASE_PRINCIPAL === EXPECTED_LOGIN;

  if (!allowed) {
    reportHold(classification === 'privileged'
      ? 'privileged_supabase_auth_api_key'
      : 'missing_or_unrecognized_supabase_auth_api_key');
  } else if (!originMatches) {
    reportHold('unexpected_supabase_origin');
  } else if (!principalMatches) {
    reportHold('unexpected_database_principal');
  } else {
    // Classification only. No key, token, JWT claims, hash, prefix, URL
    // credentials, certificate, fingerprint or full environment dump.
    console.log(
      'PASS D3e26: least-privilege_supabase_auth_key_class='
      + classification + '; governed_origin_and_runtime_login_configured'
    );
    console.log(
      'HOLD D3e26: local_shape_check_only; issuer_validation_live_connection_'
      + 'deployment_revision_and_commerce_cutover_not_proven'
    );
  }
}
