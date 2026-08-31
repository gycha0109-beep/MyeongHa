import { afterEach, describe, expect, it } from 'vitest';
import { assembleCharacterRuntimeContext } from '../packages/domain/src/index.js';

const originalNodeEnv = process.env.NODE_ENV;

function directSajuOnlyInput() {
  return {
    saju: {
      readingRef: 'forged-reading-ref',
      domain: 'career',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
    },
  } as unknown as Parameters<typeof assembleCharacterRuntimeContext>[0];
}

describe.sequential('Character Runtime Saju source-authority boundary', () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('fails closed for direct Saju context assembly in production while SRC-09/SRC-33 are unresolved', () => {
    process.env.NODE_ENV = 'production';

    expect(() => assembleCharacterRuntimeContext(directSajuOnlyInput())).toThrow(
      /blocked outside development\/test fixtures while SRC-09\/SRC-33 authority is unresolved/u,
    );
  });

  it('fails closed when runtime mode is unclassified instead of assuming fixture authority', () => {
    delete process.env.NODE_ENV;

    expect(() => assembleCharacterRuntimeContext(directSajuOnlyInput())).toThrow(
      /blocked outside development\/test fixtures while SRC-09\/SRC-33 authority is unresolved/u,
    );
  });
});
