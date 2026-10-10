# D4B-10B — Reservation receipt pin

Watchtower-Track: character-memory

Status: DEVELOPMENT / Production HOLD.

Design: pin immutable provider/model, policy/price version, admission ceiling, input/output token boundaries and the immutable database rate snapshot in the original cost ledger transaction. No separate Subject FK or PII table. Existing attempt deletion retains its privacy cleanup, and global budget accounting remains conservative.

Legacy reservations without admission-time evidence remain unresolved; never reconstruct a historical receipt from current rate cards. Trusted provider outcomes and retry queue remain D4B-10C prerequisites.
