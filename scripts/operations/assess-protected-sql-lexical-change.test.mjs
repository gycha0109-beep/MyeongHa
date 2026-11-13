import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessProtectedSqlLexicalChange } from
  './assess-protected-sql-lexical-change.mjs';

const inspect = (source, repository) => assessProtectedSqlLexicalChange(
  Buffer.from(source), Buffer.from(repository)).classification;

test('separates SQL whitespace/comments from changed executable tokens', () => {
  assert.equal(inspect(
    'SELECT 1 /* nested /* inner */ outer */ + 2; -- note\n',
    'SELECT 1+2;'),
  'CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA');
  assert.equal(inspect('GRANT SELECT ON public.x TO a;',
    'GRANT UPDATE ON public.x TO a;'), 'CODE_TOKEN_BYTES_DIFFER');
  assert.equal(inspect('SELECT 1', 'SELECT 1;'), 'CODE_TOKEN_BYTES_DIFFER');
  assert.equal(inspect('SELECT a + + b', 'SELECT a ++ b'),
    'CODE_TOKEN_BYTES_DIFFER');
});

test('keeps SQL text inside quotes and function bodies opaque', () => {
  assert.equal(inspect("SELECT '--not a comment';",
    "SELECT '--changed text';"), 'CODE_TOKEN_BYTES_DIFFER');
  assert.equal(inspect('SELECT $$BEGIN --text END$$;',
    'SELECT $$BEGIN --different END$$;'), 'CODE_TOKEN_BYTES_DIFFER');
  assert.equal(inspect("SELECT 'don''t'; -- comment\n",
    "SELECT 'don''t';"), 'CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA');
  assert.equal(inspect("SELECT E'a\\'b'", "SELECT E'a\\'b'"),
    'LEXICAL_SCAN_INDETERMINATE');
});

test('unbalanced/unsupported syntax is held and outputs no SQL tokens', () => {
  assert.equal(inspect('SELECT 1 /* comment', 'SELECT 1;'),
    'LEXICAL_SCAN_INDETERMINATE');
  assert.equal(inspect("SELECT $$unclosed", "SELECT 1"),
    'LEXICAL_SCAN_INDETERMINATE');
  assert.equal(inspect('SELECT U&"o\\00e9"', 'SELECT 1'),
    'LEXICAL_SCAN_INDETERMINATE');
  const result=assessProtectedSqlLexicalChange(
    Buffer.from('SELECT confidential_text;'),
    Buffer.from('SELECT harmless_text;'));
  assert.deepEqual(result, {
    classification:'CODE_TOKEN_BYTES_DIFFER',
    sqlSemanticEquivalenceProven:false,
    historicalExecutionCausalityProven:false,
    currentObjectAndPrivilegeEquivalenceProven:false,
  });
  assert.ok(!JSON.stringify(result).includes('confidential_text'));
  assert.ok(!JSON.stringify(result).includes('harmless_text'));
});
