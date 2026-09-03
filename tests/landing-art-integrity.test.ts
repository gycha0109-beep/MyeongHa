import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function assemble(name: 'dark' | 'light', count: number): Buffer {
  let encoded = '';
  for (let index = 1; index <= count; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const source = readFileSync(
      resolve(process.cwd(), `apps/web/landing-art-${name}-${suffix}.js`),
      'utf8',
    );
    const match = source.match(/\+'([^']+)'\s*;\s*$/);
    if (!match?.[1]) throw new Error(`Missing landing art payload: ${name}-${suffix}`);
    encoded += match[1];
  }
  return Buffer.from(encoded, 'base64');
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('landing artwork integrity', () => {
  it('reassembles the approved dark artwork as a valid AVIF', () => {
    const value = assemble('dark', 5);
    expect(value.length).toBe(25045);
    expect(value.subarray(4, 12).toString('ascii')).toBe('ftypavif');
    expect(sha256(value)).toBe('9ac33595939c52626afdd2ddf278ac26f3325efbb8b0083eadec8ad1ff01ac2c');
  });

  it('reassembles the approved light artwork as a valid AVIF', () => {
    const value = assemble('light', 5);
    expect(value.length).toBe(29585);
    expect(value.subarray(4, 12).toString('ascii')).toBe('ftypavif');
    expect(sha256(value)).toBe('ae804dbc2018e234777dffceb4dcc52c1368b2b299180cbbc19a4b4c0828100f');
  });
});
