import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scriptPath = 'scripts/verify-production-saju-current-subject.mjs';
const workflowPath = '.github/workflows/production-saju-current-subject-smoke.yml';

describe('Production current-subject Saju smoke governance', () => {
  it('covers both public Saju execution routes without logging response bodies or credentials', () => {
    const source = readFileSync(scriptPath, 'utf8');

    expect(source).toContain('/api/me/saju/calculation');
    expect(source).toContain('/api/me/saju/preview-reading');
    expect(source).toContain("const SAJU_PREVIEW_READING_TEXT = '전체 사주';");
    expect(source).toContain("body: JSON.stringify({ readingText: SAJU_PREVIEW_READING_TEXT })");
    expect(source).toContain("requireExact(`${label} lifecycle`, data.lifecycle, 'preview')");
    expect(source).toContain("'myeonghwa-product-reading-response-v2'");
    expect(source).toContain("['delivered', ['READING_DELIVERED', 'none']]");
    expect(source).toContain("['delivered_with_fallback', ['READING_DELIVERED_WITH_GROUNDED_FALLBACK', 'none']]");
    expect(source).toContain("['partial_evidence', ['READING_EVIDENCE_PARTIAL', 'none']]");
    expect(source).toContain("['insufficient_evidence', ['READING_EVIDENCE_INSUFFICIENT', 'none']]");
    expect(source).toContain('JSON.stringify(previewReading.body).includes(accessToken)');
    expect(source).not.toContain('console.log(previewReading.body)');
    expect(source).not.toContain('console.log(accessToken)');
  });

  it('keeps Preview Reading inside the existing governed Production smoke workflow', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('VERIFY_SAJU_CURRENT_SUBJECT');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('node scripts/verify-production-saju-current-subject.mjs');
    expect(workflow).toContain('Saju calculation and Preview Reading');
    expect(workflow).not.toContain('schedule:');
  });
});
