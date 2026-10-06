import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface CandidateAsset {
  readonly role: string;
  readonly assetRef: string;
  readonly sourcePath: string;
  readonly gitBlobSha: string;
  readonly sha256: string;
  readonly bytes: number;
}

interface CandidateFile {
  readonly authorityState: string;
  readonly characterId: string;
  readonly manifest: {
    readonly schemaVersion: string;
    readonly characterId: string;
    readonly assets: readonly CandidateAsset[];
    readonly emotionIds: readonly string[];
    readonly animationCueIds: readonly string[];
    readonly cueSchemaVersion: string;
    readonly minClientCapability: string;
  };
  readonly manifestHash: string;
  readonly forbiddenBeforeApproval: readonly string[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes: Buffer): string {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

const root = resolve(import.meta.dirname, '..');
const candidate = JSON.parse(
  readFileSync(
    resolve(root, 'docs/character/seyeon-production-publication-candidate-v1.json'),
    'utf8',
  ),
) as CandidateFile;

describe('세연 단일 캐릭터 운영 게시 후보 v1', () => {
  it('운영 권한이 아닌 세연 1명 승인 후보로만 고정한다', () => {
    expect(candidate.authorityState).toBe('proposal_only_not_production');
    expect(candidate.characterId).toBe('seyeon');
    expect(candidate.manifest.characterId).toBe('seyeon');
    expect(candidate.manifest.assets).toHaveLength(2);
    expect(candidate.forbiddenBeforeApproval).toEqual(
      expect.arrayContaining([
        'production_db_write',
        'content_release_activation',
        'default_release_replacement',
        'public_member_chat_activation',
      ]),
    );
  });

  it('초상화와 방 배경의 실제 바이트와 해시를 고정한다', () => {
    for (const asset of candidate.manifest.assets) {
      const bytes = readFileSync(resolve(root, asset.sourcePath));
      expect(bytes.length).toBe(asset.bytes);
      expect(sha256(bytes)).toBe(asset.sha256);
      expect(gitBlobSha(bytes)).toBe(asset.gitBlobSha);
    }
  });

  it('최소 정적 연출안만 제안한다', () => {
    expect(candidate.manifest.emotionIds).toEqual(['neutral']);
    expect(candidate.manifest.animationCueIds).toEqual(['idle']);
    expect(candidate.manifest.cueSchemaVersion).toBe('static-character-cue-v1');
    expect(candidate.manifest.minClientCapability).toBe('web-static-character-v1');
  });

  it('자산 매니페스트 해시를 동일 입력에서 재현한다', () => {
    expect(
      `sha256:v1:${sha256(stableJson(candidate.manifest))}`,
    ).toBe(candidate.manifestHash);
  });
});
