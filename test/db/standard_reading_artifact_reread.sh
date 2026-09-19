#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/standard_reading_unit_binding.sql
psql -v ON_ERROR_STOP=1 -f test/db/standard_reading_artifact_reread.sql
