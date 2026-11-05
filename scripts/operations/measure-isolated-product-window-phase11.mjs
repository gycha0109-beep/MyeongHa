import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const PROFILES = {
  baseline: { durationSeconds: 300, requestsPerSecond: 1, concurrency: 1 },
  concurrent: { durationSeconds: 900, requestsPerSecond: 4, concurrency: 4 },
};

export async function measureIsolatedProductWindow(profile, request, clock = () => performance.now(), wait = sleep) {
  if (!Object.hasOwn(PROFILES, profile)) throw new Error('Unsupported product load window');
  const { durationSeconds, requestsPerSecond, concurrency } = PROFILES[profile];
  const interval = 1000 / requestsPerSecond;
  const scheduled = durationSeconds * requestsPerSecond;
  const start = clock();
  const deadline = start + durationSeconds * 1000;
  const pending = new Set();
  const samples = [];
  let skipped = 0;
  let peak = 0;
  let nextStart = start;
  let failure;

  for (let slot = 0; slot < scheduled && !failure; slot++) {
    const scheduledAt = start + slot * interval;
    while (clock() < scheduledAt) await wait(Math.ceil(scheduledAt - clock()));
    const now = clock();
    if (now >= deadline) {
      skipped += scheduled - slot;
      break;
    }
    if (pending.size >= concurrency || now - scheduledAt >= interval || now + 5 < nextStart) {
      skipped++;
      continue;
    }
    nextStart = now + interval;
    const task = Promise.resolve().then(() => request(slot)).then(
      status => samples.push({ status, elapsedMs: clock() - now }),
      error => { failure = error ?? new Error('Product window request failed'); },
    );
    pending.add(task);
    peak = Math.max(peak, pending.size);
    void task.then(() => pending.delete(task));
    await Promise.resolve();
  }

  while (!failure && clock() < deadline) await wait(Math.ceil(deadline - clock()));
  await Promise.all(pending);
  if (failure) throw failure;
  return { durationSeconds, requestsPerSecond, concurrency, scheduled, skipped, peak,
    elapsedMs: clock() - start, samples };
}
