import { expect, it } from 'vitest';
import { measureIsolatedProductWindow } from '../../scripts/operations/measure-isolated-product-window-phase11.mjs';
import { setImmediate as yieldToRequests } from 'node:timers/promises';

it('measures all 300 single-member slots across the complete five-minute window', async () => {
  let now = 0;
  const result = await measureIsolatedProductWindow('baseline', async () => 200,
    () => now, async (ms) => { await yieldToRequests(); now += ms; });
  expect(result).toMatchObject({ elapsedMs: 300000, scheduled: 300, skipped: 0, peak: 1 });
  expect(result.samples).toHaveLength(300);
});

it('skips overdue slots instead of catching up after a stalled scheduler', async () => {
  let now = 0;
  const starts = [];
  const result = await measureIsolatedProductWindow('concurrent', async () => {
    starts.push(now);
    return 200;
  }, () => now, async (ms) => { await yieldToRequests(); now += ms + (now === 0 ? 1000 : 0); });
  expect(result).toMatchObject({ elapsedMs: 900000, scheduled: 3600, skipped: 4 });
  expect(result.samples).toHaveLength(3596);
  expect(starts.slice(0, 3)).toEqual([0, 1250, 1500]);
});

it('fails closed when a request detects an unsafe response', async () => {
  let now = 0;
  await expect(measureIsolatedProductWindow('baseline', async () => { throw new Error('Unsafe response'); },
    () => now, async (ms) => { now += ms; })).rejects.toThrow('Unsafe response');
});

it('launches four distinct requests together, one wave per second with no catch-up', async () => {
  let now = 0;
  const starts = [];
  const result = await measureIsolatedProductWindow('overlap', async (slot) => {
    starts.push([slot, now]);
    return 200;
  }, () => now, async (ms) => { await yieldToRequests(); now += ms + (now === 0 ? 1000 : 0); });
  expect(result).toMatchObject({ elapsedMs: 900000, scheduled: 3600, skipped: 4, peak: 4 });
  expect(result.samples).toHaveLength(3596);
  expect(starts.slice(0, 8)).toEqual([
    [0, 0], [1, 0], [2, 0], [3, 0], [8, 2000], [9, 2000], [10, 2000], [11, 2000],
  ]);
});
