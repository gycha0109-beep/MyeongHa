import { describe, expect, it } from 'vitest';
import {
  type CharacterRuntimeFactContentAuthorityRowV1,
  type CharacterRuntimeFactContentReadAuthorityPortV1,
  type CharacterRuntimeFactMetadataAuthorityRowV1,
  type CharacterRuntimeFactMetadataReadAuthorityPortV1,
} from '../apps/api/src/character-runtime-fact-authority.js';
import {
  CharacterRuntimeFactPacketErrorV1,
  prepareCharacterRuntimeFactPacketV1,
} from '../apps/api/src/character-runtime-fact-packet.js';

class MetadataMapPort implements CharacterRuntimeFactMetadataReadAuthorityPortV1 {
  calls: string[] = [];

  constructor(
    readonly rows: Readonly<Record<string, CharacterRuntimeFactMetadataAuthorityRowV1>>,
  ) {}

  async readFactMetadata(input: { readonly characterId: string; readonly factKey: string }) {
    this.calls.push(input.factKey);
    return this.rows[input.factKey] ?? null;
  }
}

class ContentMapPort implements CharacterRuntimeFactContentReadAuthorityPortV1 {
  calls: { factKey: string; depth: string }[] = [];

  constructor(
    readonly rows: Readonly<Record<string, CharacterRuntimeFactContentAuthorityRowV1>>,
  ) {}

  async readFactContent(input: {
    readonly characterId: string;
    readonly factKey: string;
    readonly depth: 'surface' | 'detail' | 'deep';
  }) {
    this.calls.push({
      factKey: input.factKey,
      depth: input.depth,
    });
    return this.rows[input.factKey] ?? null;
  }
}

function meta(
  factKey: string,
  overrides: Partial<CharacterRuntimeFactMetadataAuthorityRowV1> = {},
): CharacterRuntimeFactMetadataAuthorityRowV1 {
  return {
    characterId: 'seyeon',
    factKey,
    sourceAuthorityState: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    allowedDepth: 'surface',
    sourceSection: 'B1',
    sourceRevision: 'bible:seyeon-test-rev',
    ...overrides,
  };
}

function value(
  factKey: string,
  secret: unknown,
  overrides: Partial<CharacterRuntimeFactContentAuthorityRowV1> = {},
): CharacterRuntimeFactContentAuthorityRowV1 {
  return {
    characterId: 'seyeon',
    factKey,
    depth: 'surface',
    value: secret,
    sourceSection: 'B1',
    sourceRevision: 'bible:seyeon-test-rev',
    ...overrides,
  };
}

function request(
  factKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    factKey,
    relationshipStage: 'public' as const,
    trustBand: 'high' as const,
    minimumTrustBand: 'low' as const,
    contextualEligibility: false,
    characterSpecificBoundaryAllows: true,
    requestedDepth: 'surface' as const,
    ineligibleResult: 'BOUNDARY' as const,
    ...overrides,
  };
}

describe('Character Runtime fact renderer packet', () => {
  it('contains only authorized values while preserving blocked directives without private content', async () => {
    const metadataPort = new MetadataMapPort({
      basic_profile: meta('basic_profile'),
      principle_calling_binding: meta('principle_calling_binding', {
        sourceAuthorityState: 'WORLD_DEPENDENT',
        disclosureDefault: 'NOT_APPLICABLE',
        sourceSection: 'World / Principle-Calling Layer',
      }),
      hidden_world_fact: meta('hidden_world_fact', {
        characterKnowledge: 'UNKNOWN_TO_CHARACTER',
        sourceSection: 'World Authority',
      }),
    });
    const contentPort = new ContentMapPort({
      basic_profile: value('basic_profile', {
        age: 25,
      }),
      principle_calling_binding: value(
        'principle_calling_binding',
        'must-never-reach-renderer',
        {
          sourceSection: 'World / Principle-Calling Layer',
        },
      ),
      hidden_world_fact: value(
        'hidden_world_fact',
        'character-does-not-know-this',
        {
          sourceSection: 'World Authority',
        },
      ),
    });

    const plan = await prepareCharacterRuntimeFactPacketV1({
      characterId: 'seyeon',
      requests: [
        request('basic_profile'),
        request('principle_calling_binding'),
        request('hidden_world_fact'),
      ],
      metadataAuthorityPort: metadataPort,
      contentAuthorityPort: contentPort,
    });

    expect(plan.rendererPacket).toEqual({
      schemaVersion: 'v1',
      characterId: 'seyeon',
      entries: [
        {
          factKey: 'basic_profile',
          accessStatus: 'retrieved',
          claimIntegrityResult: null,
          disclosureResult: 'ALLOW',
          depth: 'surface',
          value: {
            age: 25,
          },
        },
        {
          factKey: 'principle_calling_binding',
          accessStatus: 'not_retrieved',
          claimIntegrityResult: null,
          disclosureResult: 'AUTHORITY_ABSTAIN',
        },
        {
          factKey: 'hidden_world_fact',
          accessStatus: 'knowledge_unavailable',
          claimIntegrityResult: null,
          disclosureResult: null,
        },
      ],
    });

    expect(contentPort.calls).toEqual([
      {
        factKey: 'basic_profile',
        depth: 'surface',
      },
    ]);

    const rendererJson = JSON.stringify(plan.rendererPacket);
    expect(rendererJson).not.toContain('sourceAuthorityState');
    expect(rendererJson).not.toContain('characterKnowledge');
    expect(rendererJson).not.toContain('sourceSection');
    expect(rendererJson).not.toContain('sourceRevision');
    expect(rendererJson).not.toContain('must-never-reach-renderer');
    expect(rendererJson).not.toContain('character-does-not-know-this');

    expect(plan.auditEntries).toEqual([
      {
        factKey: 'basic_profile',
        accessStatus: 'retrieved',
        sourceSection: 'B1',
        sourceRevision: 'bible:seyeon-test-rev',
        authorizedDepth: 'surface',
      },
      {
        factKey: 'principle_calling_binding',
        accessStatus: 'not_retrieved',
        sourceSection: 'World / Principle-Calling Layer',
        sourceRevision: 'bible:seyeon-test-rev',
        authorizedDepth: null,
      },
      {
        factKey: 'hidden_world_fact',
        accessStatus: 'knowledge_unavailable',
        sourceSection: 'World Authority',
        sourceRevision: 'bible:seyeon-test-rev',
        authorizedDepth: null,
      },
    ]);
    expect(JSON.stringify(plan.auditEntries)).not.toContain('age');
  });

  it('projects only the preflight-authorized partial depth into the renderer packet', async () => {
    const metadataPort = new MetadataMapPort({
      past_romance: meta('past_romance', {
        disclosureDefault: 'FAMILIAR',
        allowedDepth: 'surface',
        sourceSection: 'J4',
      }),
    });
    const contentPort = new ContentMapPort({
      past_romance: value(
        'past_romance',
        {
          exists: true,
        },
        {
          sourceSection: 'J4',
        },
      ),
    });

    const plan = await prepareCharacterRuntimeFactPacketV1({
      characterId: 'seyeon',
      requests: [
        request('past_romance', {
          relationshipStage: 'familiar',
          requestedDepth: 'deep',
        }),
      ],
      metadataAuthorityPort: metadataPort,
      contentAuthorityPort: contentPort,
    });

    expect(plan.rendererPacket.entries[0]).toEqual({
      factKey: 'past_romance',
      accessStatus: 'retrieved',
      claimIntegrityResult: null,
      disclosureResult: 'PARTIAL',
      depth: 'surface',
      value: {
        exists: true,
      },
    });
    expect(contentPort.calls).toEqual([
      {
        factKey: 'past_romance',
        depth: 'surface',
      },
    ]);
  });

  it('preserves only the integrity result rather than raw evidence metadata for renderer use', async () => {
    const metadataPort = new MetadataMapPort({
      family_structure: meta('family_structure'),
    });
    const contentPort = new ContentMapPort({
      family_structure: value('family_structure', {
        siblings: ['younger_brother'],
      }),
    });

    const plan = await prepareCharacterRuntimeFactPacketV1({
      characterId: 'seyeon',
      requests: [
        request('family_structure', {
          claim: {
            claimClass: 'CHARACTER_FACT_CLAIM',
            evidenceState: 'authoritative_conflict',
          },
        }),
      ],
      metadataAuthorityPort: metadataPort,
      contentAuthorityPort: contentPort,
    });

    expect(plan.rendererPacket.entries[0]).toMatchObject({
      accessStatus: 'retrieved',
      claimIntegrityResult: 'CONTRADICTED',
      disclosureResult: 'ALLOW',
    });
    expect(JSON.stringify(plan.rendererPacket)).not.toContain('authoritative_conflict');
  });

  it('rejects duplicate fact keys before any authority read occurs', async () => {
    const metadataPort = new MetadataMapPort({
      basic_profile: meta('basic_profile'),
    });
    const contentPort = new ContentMapPort({
      basic_profile: value('basic_profile', { age: 25 }),
    });

    await expect(
      prepareCharacterRuntimeFactPacketV1({
        characterId: 'seyeon',
        requests: [request('basic_profile'), request('basic_profile')],
        metadataAuthorityPort: metadataPort,
        contentAuthorityPort: contentPort,
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_FACT_KEY',
    });

    expect(metadataPort.calls).toHaveLength(0);
    expect(contentPort.calls).toHaveLength(0);
  });

  it('supports an empty bounded packet without inventing default Character facts', async () => {
    const metadataPort = new MetadataMapPort({});
    const contentPort = new ContentMapPort({});

    const plan = await prepareCharacterRuntimeFactPacketV1({
      characterId: 'seyeon',
      requests: [],
      metadataAuthorityPort: metadataPort,
      contentAuthorityPort: contentPort,
    });

    expect(plan.rendererPacket).toEqual({
      schemaVersion: 'v1',
      characterId: 'seyeon',
      entries: [],
    });
    expect(plan.auditEntries).toEqual([]);
    expect(metadataPort.calls).toHaveLength(0);
    expect(contentPort.calls).toHaveLength(0);
  });

  it('rejects an invalid Character id before authority reads', async () => {
    const metadataPort = new MetadataMapPort({});
    const contentPort = new ContentMapPort({});

    await expect(
      prepareCharacterRuntimeFactPacketV1({
        characterId: '   ',
        requests: [],
        metadataAuthorityPort: metadataPort,
        contentAuthorityPort: contentPort,
      }),
    ).rejects.toBeInstanceOf(CharacterRuntimeFactPacketErrorV1);

    expect(metadataPort.calls).toHaveLength(0);
    expect(contentPort.calls).toHaveLength(0);
  });
});
