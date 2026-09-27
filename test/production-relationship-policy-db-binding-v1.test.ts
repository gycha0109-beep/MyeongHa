import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  canonicalJson,
} from '../packages/domain/src/index.js';

describe('Production relationship policy DB binding V1', () => {
  it('pins the exact compiled immutable artifact into the PHASE M seed migration', () => {
    const sql = readFileSync(
      new URL(
        '../supabase/migrations/1350_relationship_policy_v1_activation.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(sql).toContain(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash);
    expect(sql).toContain(
      canonicalJson(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload),
    );
    expect(sql).toContain("'relationship-policy-definition-v1'");
    expect(sql).toContain("'relationship-policy-v1'");
  });
});
