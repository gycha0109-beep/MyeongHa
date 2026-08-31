import { afterEach, describe, expect, it } from 'vitest';
import {
  runMockCharacterChatTurn,
  runMockFirstReadingTurn,
} from '../apps/api/src/index.js';

const originalNodeEnv = process.env.NODE_ENV;

function expectMockExecutionBlocked(): void {
  expect(() =>
    runMockCharacterChatTurn(
      {} as Parameters<typeof runMockCharacterChatTurn>[0],
    ),
  ).toThrow(
    /runMockCharacterChatTurn is restricted to development\/test Engineering Vertical Slice fixtures/u,
  );

  expect(() =>
    runMockFirstReadingTurn(
      {} as Parameters<typeof runMockFirstReadingTurn>[0],
      {} as Parameters<typeof runMockFirstReadingTurn>[1],
      {} as Parameters<typeof runMockFirstReadingTurn>[2],
    ),
  ).toThrow(
    /runMockFirstReadingTurn is restricted to development\/test Engineering Vertical Slice fixtures/u,
  );
}

describe.sequential('mock execution source-authority boundary', () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('fails closed in production before caller-supplied capability or mock execution can run', () => {
    process.env.NODE_ENV = 'production';
    expectMockExecutionBlocked();
  });

  it('fails closed when runtime mode is unclassified instead of assuming fixture authority', () => {
    delete process.env.NODE_ENV;
    expectMockExecutionBlocked();
  });
});
