import { readFile } from 'node:fs/promises';

const CHECKOUT_SHA = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

const contracts = [
  {
    file: 'production-password-compromise-guard-evidence.yml',
    confirm: 'VERIFY_PASSWORD_COMPROMISE_GUARD',
    commands: ['node scripts/operations/verify-production-password-compromise-guard-live.mjs'],
    required: [
      'watchtower_track:',
      'default: ops',
      'MYEONGHA_WATCHTOWER_TRACK: ${{ inputs.watchtower_track }}',
      'MYEONGHA_PASSWORD_COMPROMISE_CANARY_CONFIRM: ${{ inputs.confirmation }}',
      '[[ "$GITHUB_REF" == \'refs/heads/main\' ]]',
    ],
    forbidSecrets: true,
  },
  {
    file: 'production-authenticated-json-resource-evidence.yml',
    confirm: 'VERIFY_AUTHENTICATED_JSON_RESOURCE_BOUND',
    commands: ['node scripts/operations/verify-production-authenticated-json-resource-live.mjs'],
    required: [
      'watchtower_track:',
      'default: ops',
      'MYEONGHA_WATCHTOWER_TRACK: ${{ inputs.watchtower_track }}',
      'MYEONGHA_AUTHENTICATED_JSON_RESOURCE_CONFIRM: ${{ inputs.confirmation }}',
      '[[ "$GITHUB_REF" == \'refs/heads/main\' ]]',
      'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER }}',
    ],
  },
  {
    file: 'production-member-me-smoke.yml',
    confirm: 'VERIFY_MEMBER_ME',
    commands: ['node scripts/verify-production-member-me.mjs'],
    required: [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-member-reauth-continuity-smoke.yml',
    confirm: 'VERIFY_MEMBER_REAUTH_CONTINUITY',
    pushPath: '.github/production-member-reauth-continuity-smoke.trigger',
    commands: ['node scripts/verify-production-member-reauth-continuity.mjs'],
    required: [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-birth-profile-create-boundary-smoke.yml',
    confirm: 'VERIFY_BIRTH_CREATE_BOUNDARY',
    commands: ['node scripts/verify-production-birth-profile-create-boundary.mjs'],
  },
  {
    file: 'production-birth-profile-authenticated-create-read-smoke.yml',
    confirm: 'VERIFY_BIRTH_AUTHENTICATED_CREATE_READ',
    commands: ['node scripts/verify-production-birth-profile-authenticated-create-read.mjs'],
    actionsRead: true,
    required: [
      'GH_TOKEN: ${{ github.token }}',
      'prior_successes=',
      "actions/workflows/production-birth-profile-authenticated-create-read-smoke.yml/runs?event=workflow_dispatch&status=success&per_page=1",
      "[[ \"$prior_successes\" == '0' ]]",
      'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER: ${{ secrets.MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER }}',
      'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-birth-profile-guest-create-read-smoke.yml',
    confirm: 'VERIFY_GUEST_BIRTH_CREATE_READ_ONCE',
    commands: ['node scripts/verify-production-birth-profile-guest-create-read.mjs'],
    actionsRead: true,
    forbidSecrets: true,
  },
  {
    file: 'production-saju-current-subject-smoke.yml',
    confirm: 'VERIFY_SAJU_CURRENT_SUBJECT',
    pushPath: '.github/production-saju-current-subject-smoke.trigger',
    commands: ['node scripts/verify-production-saju-current-subject.mjs'],
    required: [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-records-current-subject-smoke.yml',
    confirm: 'VERIFY_RECORDS_CURRENT_SUBJECT',
    pushPath: '.github/production-records-current-subject-smoke.trigger',
    commands: [
      'node scripts/verify-production-records-current-subject.mjs',
      'node scripts/verify-production-reading-history-current-subject.mjs',
      'node scripts/wait-production-records-sample-boundary.mjs',
      'node scripts/verify-production-records-browser.mjs',
    ],
    required: [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-chat-current-subject-smoke.yml',
    confirm: 'VERIFY_CHAT_CURRENT_SUBJECT',
    pushPath: '.github/production-chat-current-subject-smoke.trigger',
    commands: ['bash scripts/run-production-member-chat-read-smoke.sh'],
    required: [
      'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
      'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
  {
    file: 'production-member-chat-open-reuse-smoke.yml',
    confirm: 'VERIFY_MEMBER_CHAT_OPEN_REUSE',
    commands: ['node scripts/verify-production-member-chat-open-reuse.mjs'],
    required: [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EMAIL }}',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_PASSWORD }}',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: ${{ secrets.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID }}',
    ],
  },
];

function section(source, start, next) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return '';
  const rest = source.slice(startIndex + start.length);
  const nextIndex = rest.indexOf(next);
  return nextIndex < 0 ? rest : rest.slice(0, nextIndex);
}

for (const contract of contracts) {
  const path = '.github/workflows/' + contract.file;
  const workflow = await readFile(path, 'utf8');
  const onSection = section(workflow, 'on:\n', '\npermissions:');
  const permissionsSection = section(workflow, 'permissions:\n', '\nconcurrency:');

  if ((onSection.match(/workflow_dispatch:/g) ?? []).length !== 1) {
    throw new Error(contract.file + ': exactly one workflow_dispatch trigger is required.');
  }
  if (onSection.includes('schedule:') || onSection.includes('pull_request:')) {
    throw new Error(contract.file + ': production smoke must not run on schedule or pull_request.');
  }
  if (contract.pushPath) {
    if (!onSection.includes('push:') || !onSection.includes('- main') || !onSection.includes(contract.pushPath)) {
      throw new Error(contract.file + ': governed main push trigger is incomplete.');
    }
  } else if (onSection.includes('push:')) {
    throw new Error(contract.file + ': this smoke is manual-only.');
  }

  if (!permissionsSection.includes('contents: read')) {
    throw new Error(contract.file + ': contents: read permission is required.');
  }
  if (permissionsSection.includes('write')) {
    throw new Error(contract.file + ': write permissions are forbidden.');
  }
  if (contract.actionsRead && !permissionsSection.includes('actions: read')) {
    throw new Error(contract.file + ': actions: read is required for the one-shot history guard.');
  }

  if (!workflow.includes('environment: production')) {
    throw new Error(contract.file + ': production environment gate is required.');
  }
  if (!workflow.includes(contract.confirm)) {
    throw new Error(contract.file + ': missing explicit confirmation token ' + contract.confirm + '.');
  }

  if (workflow.includes('actions/checkout@') && !workflow.includes(CHECKOUT_SHA)) {
    throw new Error(contract.file + ': checkout must be pinned to the governed SHA.');
  }
  if (workflow.includes('actions/setup-node@') && !workflow.includes(SETUP_NODE_SHA)) {
    throw new Error(contract.file + ': setup-node must be pinned to the governed SHA.');
  }

  for (const command of contract.commands) {
    if (!workflow.includes(command)) {
      throw new Error(contract.file + ': missing governed verifier command: ' + command);
    }
  }
  for (const fragment of contract.required ?? []) {
    if (!workflow.includes(fragment)) {
      throw new Error(contract.file + ': missing required authority fragment: ' + fragment);
    }
  }

  if (contract.forbidSecrets && workflow.includes('secrets.')) {
    throw new Error(contract.file + ': this synthetic guest smoke must not consume repository secrets.');
  }

  const forbidden = [
    'contents: write',
    'actions: write',
    'VERCEL_TOKEN',
    'MYEONGHA_DATABASE_URL',
    'MYEONGHA_DATABASE_PRINCIPAL',
    'vercel deploy',
    'vercel --prod',
    'supabase db',
    'alter role',
    'set -x',
  ];
  for (const fragment of forbidden) {
    if (workflow.includes(fragment)) {
      throw new Error(contract.file + ': forbidden production-smoke authority fragment: ' + fragment);
    }
  }
}

console.log('Production smoke workflow contracts passed (' + contracts.length + ' workflows).');
