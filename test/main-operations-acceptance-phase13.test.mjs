import { describe, expect, it } from 'vitest';
import {
  MAIN_OPERATIONS_EVIDENCE_SCHEMA_V1,
  collectMainOperationsEvidenceV1,
  summarizeMainOperationsEvidenceV1,
} from '../scripts/operations/inspect-main-operations-acceptance.mjs';

const SHA = 'a'.repeat(40);
const NEW_MAIN = 'b'.repeat(40);

function run(name, id, patch = {}) {
  return {
    name, id, event: 'push', head_branch: 'main', head_sha: SHA,
    status: 'completed', conclusion: 'success', ...patch,
  };
}

function summarize(runs, jobs = []) {
  return summarizeMainOperationsEvidenceV1({
    requestedSha: SHA,
    confirmedCommitSha: SHA,
    currentMainSha: NEW_MAIN,
    runs,
    productionJobs: jobs,
  });
}

describe('Phase 13 exact-commit operations acceptance evidence inventory', () => {
  it('reports actual passed main workflows but never invents live operations acceptance', () => {
    const result = summarize([
      run('CI', 101), run('Governance', 102),
      run('Web Browser Smoke', 103), run('Supabase Production', 104),
    ], [
      { name: 'detect-production-db-relevance', status: 'completed', conclusion: 'success' },
      { name: 'deploy-migrations', status: 'completed', conclusion: 'skipped' },
    ]);
    expect(result).toMatchObject({
      schema: MAIN_OPERATIONS_EVIDENCE_SCHEMA_V1,
      target: 'github-main-commit-readonly',
      sourceSha: SHA,
      sourceIsCurrentMain: false,
      productionDatabaseMigrationJob: 'SKIPPED',
      productionWorkflowSuccessIsNotDeploymentProof: true,
      observedMinimumRequirementCount: 1,
      acceptanceDecision: 'NOT_EVALUATED_BY_COLLECTOR',
      noRuntimeOrProductionMutations: true,
      outputContainsIdentifiers: false,
    });
    expect(result.workflows.CI).toEqual({
      state: 'SUCCESS', runId: 101,
      url: 'https://github.com/gycha0109-beep/MyeongHa/actions/runs/101',
    });
    expect(result.minimumProductionVerification.providerDeploymentState).toBe('NOT_OBSERVED');
    expect(result.minimumProductionVerification.positiveSyntheticAuthSmoke).toBe('NOT_OBSERVED');
    expect(result.minimumProductionVerification.livePrivateNoStore).toBe('NOT_OBSERVED');
  });

  it('never substitutes a successful PR or unrelated SHA workflow for main push evidence', () => {
    const result = summarize([
      run('CI', 200, { event: 'pull_request' }),
      run('CI', 201, { head_sha: 'c'.repeat(40) }),
      run('Governance', 202, { head_branch: 'feature/example' }),
      run('Web Browser Smoke', 203, { status: 'in_progress', conclusion: null }),
    ]);
    expect(result.workflows.CI.state).toBe('NOT_OBSERVED');
    expect(result.workflows.Governance.state).toBe('NOT_OBSERVED');
    expect(result.workflows['Web Browser Smoke'].state).toBe('IN_PROGRESS');
  });

  it('takes latest run for the pinned commit instead of borrowing older success', () => {
    const result = summarize([
      run('CI', 301),
      run('CI', 304, { conclusion: 'failure' }),
      run('Governance', 302, { conclusion: 'cancelled' }),
    ]);
    expect(result.workflows.CI).toMatchObject({ state: 'FAILURE', runId: 304 });
    expect(result.workflows.Governance.state).toBe('CANCELLED');
    expect(result.productionDatabaseMigrationJob).toBe('NOT_OBSERVED');
  });

  it('counts deployment only when that exact workflow job actually succeeded', () => {
    const runs = [run('Supabase Production', 501)];
    expect(summarize(runs, [{ name: 'deploy-migrations', status: 'completed', conclusion: 'success' }])
      .productionDatabaseMigrationJob).toBe('SUCCESS');
    expect(summarize(runs, [{ name: 'deploy-migrations', status: 'completed', conclusion: 'failure' }])
      .productionDatabaseMigrationJob).toBe('FAILURE');
    expect(summarize(runs).productionDatabaseMigrationJob).toBe('NOT_OBSERVED');
    expect(summarize([run('Supabase Production', 502, { conclusion: 'failure' })], [
      { name: 'deploy-migrations', status: 'completed', conclusion: 'success' },
    ]).productionDatabaseMigrationJob).toBe('NOT_OBSERVED');
  });

  it('performs only exact-repository read-only GitHub requests and never emits bearer', async () => {
    const visited = [];
    const secret = 'synthetic-token-do-not-print';
    const result = await collectMainOperationsEvidenceV1({
      sha: SHA,
      token: secret,
      request: async (url, options) => {
        visited.push(url);
        expect(options.method).toBe('GET');
        expect(options.redirect).toBe('error');
        expect(options.headers.Authorization).toBe('Bearer ' + secret);
        const path = new URL(url).pathname;
        let value;
        if (path.endsWith('/commits/' + SHA)) value = { sha: SHA };
        else if (path.endsWith('/git/ref/heads/main')) value = { object: { sha: SHA } };
        else if (path.endsWith('/actions/runs')) value = {
          total_count: 2,
          workflow_runs: [run('CI', 601), run('Supabase Production', 602)],
        };
        else if (path.endsWith('/actions/runs/602/jobs')) value = {
          total_count: 2, jobs: [
            { name: 'detect-production-db-relevance', status: 'completed', conclusion: 'success' },
            { name: 'deploy-migrations', status: 'completed', conclusion: 'skipped' },
          ],
        };
        else throw Error('unexpected request');
        return { status: 200, json: async () => value };
      },
    });
    expect(visited).toHaveLength(4);
    expect(visited.every(x => x.startsWith('https://api.github.com/repos/gycha0109-beep/MyeongHa/'))).toBe(true);
    expect(result.sourceIsCurrentMain).toBe(true);
    expect(result.productionDatabaseMigrationJob).toBe('SKIPPED');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects incomplete source evidence without making an acceptance claim', async () => {
    expect(() => summarizeMainOperationsEvidenceV1({
      requestedSha: SHA, confirmedCommitSha: NEW_MAIN, currentMainSha: SHA, runs: [],
    })).toThrow('commit provenance');
    await expect(collectMainOperationsEvidenceV1({
      sha: SHA,
      request: async () => ({ status: 200, json: async () => ({}) }),
    })).rejects.toThrow('incomplete commit-bound workflow evidence');
    await expect(collectMainOperationsEvidenceV1({
      sha: 'not-a-sha',
      request: async () => { throw Error('should not make requests'); },
    })).rejects.toThrow('exact 40-character commit SHA');
  });
});
