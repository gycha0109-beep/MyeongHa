// Inspect SQL source and repository bytes only in the protected, disposable runner.
// This conservative tokenizer does NOT establish SQL semantic or execution equivalence.
// Never emit source SQL, literals, identifiers, changed fragments, or token hashes.
// Watchtower-Track: ops
import assert from 'node:assert/strict';

const whitespace = ch => ch === ' ' || ch === '\t' || ch === '\r' ||
  ch === '\n' || ch === '\v' || ch === '\f';
const wordChar = ch => /[A-Za-z0-9_]/u.test(ch) ||
  ch.charCodeAt(0) > 127;
const operatorChar = ch => '+-*/<>=~!@#%^&|?:'.includes(ch);

function codeTokens(bytes) {
  assert.ok(Buffer.isBuffer(bytes));
  const sql = bytes.toString('utf8');
  if (!Buffer.from(sql, 'utf8').equals(bytes)) return null;
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (whitespace(ch)) { i++; continue; }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2);
      i = end < 0 ? sql.length : end;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) return null;
      continue;
    }
    // Dollar-quoted function bodies are opaque. The interior may contain
    // executable SQL and must not be filtered as outer-SQL trivia.
    if (ch === '$') {
      const opener = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(
        sql.slice(i, i + 128));
      if (opener) {
        const close = sql.indexOf(opener[0], i + opener[0].length);
        if (close < 0) return null;
        const end = close + opener[0].length;
        tokens.push(sql.slice(i, end));
        i = end;
        continue;
      }
      if (/[A-Za-z_]/u.test(sql[i + 1] ?? '')) return null;
    }
    if (ch === "'" || ch === '"') {
      // Escaped or Unicode strings are conservatively held; the session's
      // standard_conforming_strings mode is not inferred from the source.
      if (i >= 2 && sql.slice(i - 2, i).toUpperCase() === 'U&') return null;
      let end = i + 1;
      let closed = false;
      while (end < sql.length) {
        if (sql[end] === '\\') return null;
        if (sql[end] === ch) {
          if (sql[end + 1] === ch) { end += 2; continue; }
          end++;
          closed = true;
          break;
        }
        end++;
      }
      if (!closed) return null;
      tokens.push(sql.slice(i, end));
      i = end;
      continue;
    }
    // PostgreSQL decimal/exponent literals are one lexical unit.
    // Do not equate "1.2" to "1 . 2" by splitting both at the dot.
    if (/[0-9]/u.test(ch) ||
      (ch === '.' && /[0-9]/u.test(sql[i + 1] ?? ''))) {
      const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/u.exec(
        sql.slice(i));
      if (!number) return null;
      tokens.push(number[0]);
      i += number[0].length;
      continue;
    }
    if (wordChar(ch)) {
      let end = i + 1;
      while (end < sql.length && wordChar(sql[end])) end++;
      tokens.push(sql.slice(i, end));
      i = end;
      continue;
    }
    if (operatorChar(ch)) {
      let end = i + 1;
      while (end < sql.length && operatorChar(sql[end]) &&
        !sql.startsWith('--', end) && !sql.startsWith('/*', end)) end++;
      tokens.push(sql.slice(i, end));
      i = end;
      continue;
    }
    tokens.push(ch);
    i++;
  }
  return tokens;
}

export function assessProtectedSqlLexicalChange(sourceBytes, repositoryBytes) {
  assert.ok(Buffer.isBuffer(sourceBytes) && Buffer.isBuffer(repositoryBytes));
  const source = codeTokens(sourceBytes);
  const repository = codeTokens(repositoryBytes);
  let classification = 'LEXICAL_SCAN_INDETERMINATE';
  if (source !== null && repository !== null) {
    classification = source.length === repository.length &&
      source.every((token, i) => token === repository[i])
      ? 'CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA'
      : 'CODE_TOKEN_BYTES_DIFFER';
  }
  return {
    classification,
    sqlSemanticEquivalenceProven: false,
    historicalExecutionCausalityProven: false,
    currentObjectAndPrivilegeEquivalenceProven: false,
  };
}
