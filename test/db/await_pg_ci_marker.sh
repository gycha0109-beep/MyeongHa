#!/usr/bin/env bash
# Source-only helper for synthetic PostgreSQL concurrency fixtures.
# Observe a SQL-session marker, not a guessed fixed startup delay.
await_pg_ci_marker() {
  local marker="${1:?marker path required}"
  local child_pid="${2:?worker pid required}"
  local max_checks="${3:-100}"
  local delay="${4:-0.05}"
  local attempt
  if [[ ! "$child_pid" =~ ^[1-9][0-9]*$ || ! "$max_checks" =~ ^[1-9][0-9]*$ ]]; then
    echo 'await_pg_ci_marker: invalid worker pid or check bound' >&2
    return 2
  fi
  for ((attempt=0; attempt<max_checks; attempt++)); do
    if [[ -f "$marker" ]]; then
      return 0
    fi
    if ! kill -0 "$child_pid" 2>/dev/null; then
      echo 'await_pg_ci_marker: worker exited before SQL session signal' >&2
      return 1
    fi
    sleep "$delay"
  done
  echo 'await_pg_ci_marker: timed out before SQL session signal' >&2
  return 1
}
