if (!process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS) {
  process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS = '5000';
}

process.argv.push('--live');
await import('./reading-boundary.mjs');
