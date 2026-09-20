import assert from 'node:assert/strict';
import {
  HostedAuthCanaryKeySelectionError,
  selectHostedAuthCanaryAdminKey,
} from './account-deletion-hosted-auth-canary-key-selection.mjs';

const MODERN_DEFAULT = `sb_secret_${'a'.repeat(48)}`;
const MODERN_OTHER = `sb_secret_${'b'.repeat(48)}`;
const LEGACY_SERVICE_ROLE = `eyJ${'c'.repeat(96)}`;

assert.equal(
  selectHostedAuthCanaryAdminKey([
    {
      api_key: LEGACY_SERVICE_ROLE,
      type: 'legacy',
      name: 'service_role',
    },
    {
      api_key: MODERN_DEFAULT,
      type: 'secret',
      name: 'default',
    },
  ]),
  MODERN_DEFAULT,
);

assert.equal(
  selectHostedAuthCanaryAdminKey([
    {
      api_key: MODERN_OTHER,
      type: 'secret',
      name: 'worker',
    },
  ]),
  MODERN_OTHER,
);

assert.equal(
  selectHostedAuthCanaryAdminKey([
    {
      api_key: LEGACY_SERVICE_ROLE,
      type: 'legacy',
      name: 'service_role',
    },
  ]),
  LEGACY_SERVICE_ROLE,
);

assert.throws(
  () =>
    selectHostedAuthCanaryAdminKey([
      { api_key: MODERN_DEFAULT, type: 'secret', name: 'one' },
      { api_key: MODERN_OTHER, type: 'secret', name: 'two' },
    ]),
  (error) =>
    error instanceof HostedAuthCanaryKeySelectionError &&
    error.code === 'MANAGEMENT_API_SECRET_KEY_AMBIGUOUS',
);

assert.throws(
  () =>
    selectHostedAuthCanaryAdminKey([
      { api_key: 'public-value', type: 'publishable', name: 'default' },
    ]),
  (error) =>
    error instanceof HostedAuthCanaryKeySelectionError &&
    error.code === 'MANAGEMENT_API_ADMIN_KEY_NOT_FOUND',
);

assert.throws(
  () => selectHostedAuthCanaryAdminKey({ api_key: MODERN_DEFAULT }),
  (error) =>
    error instanceof HostedAuthCanaryKeySelectionError &&
    error.code === 'MANAGEMENT_API_SCHEMA_INVALID',
);

console.log(
  'MYEONGHA_HOSTED_AUTH_CANARY_KEY_SELECTION_PASS modern_preferred=true legacy_fallback=true ambiguity_fail_closed=true',
);
