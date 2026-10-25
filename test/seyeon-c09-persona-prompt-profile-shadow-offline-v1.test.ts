import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEYEON_C09_AUTHORED_SOURCES_V1,
  composeSeyeonC09PersonaPromptPlanV1,
} from '../apps/api/src/seyeon-c09-persona-prompt-profile-shadow-v1.js';

function gitBlobHash(path: string): string {
  const bytes = readFileSync(resolve(process.cwd(), path));
  return createHash('sha1')
    .update('blob ' + bytes.byteLength + '\0')
    .update(bytes)
    .digest('hex');
}

describe('C09 authored Se-yeon persona prompt composition — offline research only', () => {
  it('pins the currently authored Bible and Runtime bytes, not the stale projection', () => {
    expect(gitBlobHash(SEYEON_C09_AUTHORED_SOURCES_V1.bible.path))
      .toBe(SEYEON_C09_AUTHORED_SOURCES_V1.bible.gitBlobSha);
    expect(gitBlobHash(SEYEON_C09_AUTHORED_SOURCES_V1.runtime.path))
      .toBe(SEYEON_C09_AUTHORED_SOURCES_V1.runtime.gitBlobSha);
  });

  it('keeps one stable core without sending a model request or claiming approval', () => {
    const core = composeSeyeonC09PersonaPromptPlanV1({ profile: 'core' });
    expect(core.scope).toBe('SHADOW_RESEARCH_ONLY_NO_PROVIDER_NO_AUTHORITY');
    expect(core.productionRoutingAuthorized).toBe(false);
    expect(core.independentSemanticReviewPerformed).toBe(false);
    expect(core.selectedFocuses).toEqual([]);
    expect(core.personaInstructions).toContain('세연');
    expect(core.personaInstructions).toContain('자기 의견');
    expect(core.personaInstructions).toContain('서버 소유');
    expect(core.personaInstructions).not.toContain('37일 전');
    expect(Object.isFrozen(core)).toBe(true);
    expect(Object.isFrozen(core.selectedSourceSections)).toBe(true);
  });

  it('separates few-shot and relevant authored runtime overlays from the core', () => {
    const a = composeSeyeonC09PersonaPromptPlanV1({ profile: 'core' });
    const b = composeSeyeonC09PersonaPromptPlanV1({ profile: 'core_examples' });
    const c = composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core_focus', selectedFocuses: ['low_state', 'present_opinion'],
    });
    expect(a.personaInstructions).not.toContain('말투 참고 예');
    expect(b.personaInstructions).toContain('말투 참고 예');
    expect(b.personaInstructions).not.toContain('가벼운 피곤함');
    expect(c.personaInstructions).toContain('가벼운 피곤함');
    expect(c.personaInstructions).toContain('현재 시점의 실제 취향');
    expect(c.selectedSourceSections).toContain('Runtime R5/R8/R13');
    expect(c.selectedSourceSections).toContain('Runtime R2.5/R4/R7');
    expect(c.personaInstructions.length).toBeLessThanOrEqual(8000);
  });

  it('rejects arbitrary, duplicate, and unrequested focus instructions', () => {
    expect(() => composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core', selectedFocuses: ['smalltalk'],
    })).toThrow('C09_INVALID_FOCUS_SELECTION');
    expect(() => composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core_focus', selectedFocuses: [],
    })).toThrow('C09_INVALID_FOCUS_SELECTION');
    expect(() => composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core_focus', selectedFocuses: ['smalltalk', 'smalltalk'],
    })).toThrow('C09_UNKNOWN_OR_DUPLICATE_FOCUS');
    expect(() => composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core_focus',
      selectedFocuses: ['private_biography' as 'smalltalk'],
    })).toThrow('C09_UNKNOWN_OR_DUPLICATE_FOCUS');
    expect(() => composeSeyeonC09PersonaPromptPlanV1({
      profile: 'core_focus',
      selectedFocuses: ['choice', 'low_state', 'smalltalk'],
    })).toThrow('C09_INVALID_FOCUS_SELECTION');
  });
});
