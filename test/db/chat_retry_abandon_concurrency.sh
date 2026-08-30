#!/usr/bin/env bash
set -euo pipefail

bash test/db/chat_retry_abandon_concurrency_legacy.sh
bash test/db/chat_turn_retry_command_v2.sh
