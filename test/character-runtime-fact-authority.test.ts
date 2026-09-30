import { describe, expect, it } from 'vitest';
import {
  CharacterRuntimeFactAccessErrorV1,
  prepareCharacterRuntimeFactAccessV1,
  type CharacterRuntimeFactContentAuthorityRowV1,
  type CharacterRuntimeFactContentReadAuthorityPortV1,
  type CharacterRuntimeFactMetadataAuthorityRowV1,
  type CharacterRuntimeFactMetadataReadAuthorityPortV1,
} from '../apps/api/src/character-runtime-fact-authority.js';

function metadata(
  overrides: Partial<CharacterRuntimeFactMetadataAuthorityRowV1> = {},
): CharacterRuntimeFactMetadataAuthorityRowV1 {
  return {
    characterId: 'seyeon',
    factKey: 'past_romance_detail',
    sourceAuthorityState: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'ATTACHED',
    allowedDepth: 'detail',
    sourceSection: 'J4',
    sourceRevision: 'bible:test-rev-1',
    ...overrides,
  };
}

function content(
  overrides: Partial<CharacterRuntimeFactContentAuthorityRowV1> = {},
): CharacterRuntimeFactContentAuthorityRowV1 {
  return {
    characterId: 'seyeon',
    factKey: 'past_romance_detail',
    depth: 'detail',
    value: {
      summary: 'source-authorized test fixture only',
    },
    sourceSection: 'J4',
    sourceRevision: 'bible:test-rev-1',
    ...overrides,
  };
}

class MetadataPort implements CharacterRuntimeFactMetadataReadAuthorityPortV1 {
  calls = 0;

  constructor(readonly row: CharacterRuntimeFactMetadataAuthorityRowV1 | null) {}

  async readFactMetadata() {
    this.calls += 1;
    return this.row;
  }
}

class ContentPort implements CharacterRuntimeFactContentReadAuthorityPortV1 {
  calls: { characterId: string; factKey: string; depth: string }[] = [];

  constructor(readonly row: CharacterRuntimeFactContentAuthorityRowV1 | null) {}

  async readFactContent(input: {
    readonly characterId: string;
    readonly factKey: string;
    readonly depth: 'surface' | 'detail' | 'deep';
  }) {
    this.calls.push({ ...input });
    return this.row;
  }
}

function input(
  metadataPort: CharacterRuntimeFactMetadataReadAuthorityPortV1,
  contentPort: CharacterRuntimeFactContentReadAuthorityPortV1,
) {
  return {
    characterId: 'seyeon',
    factKey: 'past_romance_detail',
    relationshipStage: 'attached' as const,
    trustBand: 'high' as const,
    minimumTrustBand: 'medium' as const,
    contextualEligibility: false,
    characterSpecificBoundaryAllows: true,
    requestedDepth: 'detail' as const,
    ineligibleResult: 'BOUNDARY' as const,
    metadataAuthorityPort: metadataPort,
    contentAuthorityPort: contentPort,
  };
}

describe('Character Runtime fact authority seam', () => {
  it('does not read private fact content before the relationship gate opens', async () => {
    const metadataPort = new MetadataPort(metadata());
    const contentPort = new ContentPort(content());

    const result = await prepareCharacterRuntimeFactAccessV1({
      ...input(metadataPort, contentPort),
      relationshipStage: 'public',
      trustBand: 'low',
    });

    expect(result.status).toBe('not_retrieved');
    expect(result.preflight?.disclosure).toMatchObject({
      result: 'BOUNDARY',
      reason: 'relationship_gate',
      retrieval: { scope: 'none' },
    });
    expect(contentPort.calls).toHaveLength(0);
  });

  it('returns authority abstention and never reads content for AUTHOR_UNDEFINED facts', async () => {
    const metadataPort = new MetadataPort(
      metadata({
        sourceAuthorityState: 'AUTHOR_UNDEFINED',
      }),
    );
    const contentPort = new ContentPort(content());

    const result = await prepareCharacterRuntimeFactAccessV1(
      input(metadataPort, contentPort),
    );

    expect(result.status).toBe('not_retrieved');
    expect(result.preflight?.disclosure).toMatchObject({
      result: 'AUTHORITY_ABSTAIN',
      reason: 'source_authority_unresolved',
      retrieval: { scope: 'none' },
    });
    expect(contentPort.calls).toHaveLength(0);
  });

  it('keeps WORLD_DEPENDENT Principle/Calling facts unresolved and unread', async () => {
    const metadataPort = new MetadataPort(
      metadata({
        factKey: 'principle_calling_binding',
        sourceAuthorityState: 'WORLD_DEPENDENT',
        disclosureDefault: 'NOT_APPLICABLE',
        sourceSection: 'World / Principle-Calling Layer',
      }),
    );
    const contentPort = new ContentPort(
      content({
        factKey: 'principle_calling_binding',
        sourceSection: 'World / Principle-Calling Layer',
      }),
    );

    const result = await prepareCharacterRuntimeFactAccessV1({
      ...input(metadataPort, contentPort),
      factKey: 'principle_calling_binding',
      relationshipStage: 'public',
      trustBand: 'high',
      minimumTrustBand: 'low',
    });

    expect(result.status).toBe('not_retrieved');
    expect(result.preflight?.disclosure).toMatchObject({
      result: 'AUTHORITY_ABSTAIN',
      retrieval: { scope: 'none' },
    });
    expect(contentPort.calls).toHaveLength(0);
  });

  it('blocks retrieval when the authoritative fact is unknown to the active Character', async () => {
    const metadataPort = new MetadataPort(
      metadata({
        characterKnowledge: 'UNKNOWN_TO_CHARACTER',
      }),
    );
    const contentPort = new ContentPort(content());

    const result = await prepareCharacterRuntimeFactAccessV1(
      input(metadataPort, contentPort),
    );

    expect(result).toMatchObject({
      status: 'knowledge_unavailable',
      preflight: null,
      content: null,
    });
    expect(contentPort.calls).toHaveLength(0);
  });

  it('reads content only after an allowed bounded preflight', async () => {
    const metadataPort = new MetadataPort(metadata());
    const contentPort = new ContentPort(content());

    const result = await prepareCharacterRuntimeFactAccessV1(
      input(metadataPort, contentPort),
    );

    expect(result.status).toBe('retrieved');
    expect(result.preflight?.disclosure).toMatchObject({
      result: 'ALLOW',
      retrieval: { scope: 'bounded', depth: 'detail' },
    });
    expect(contentPort.calls).toEqual([
      {
        characterId: 'seyeon',
        factKey: 'past_romance_detail',
        depth: 'detail',
      },
    ]);
    expect(result.content?.value).toEqual({
      summary: 'source-authorized test fixture only',
    });
  });

  it('reads only the lower authored depth when preflight returns PARTIAL', async () => {
    const metadataPort = new MetadataPort(
      metadata({
        allowedDepth: 'surface',
      }),
    );
    const contentPort = new ContentPort(
      content({
        depth: 'surface',
      }),
    );

    const result = await prepareCharacterRuntimeFactAccessV1({
      ...input(metadataPort, contentPort),
      requestedDepth: 'deep',
    });

    expect(result.status).toBe('retrieved');
    expect(result.preflight?.disclosure).toMatchObject({
      result: 'PARTIAL',
      retrieval: { scope: 'bounded', depth: 'surface' },
    });
    expect(contentPort.calls[0]).toMatchObject({
      depth: 'surface',
    });
  });

  it('preserves claim integrity independently from fact disclosure authority', async () => {
    const metadataPort = new MetadataPort(metadata());
    const contentPort = new ContentPort(content());

    const result = await prepareCharacterRuntimeFactAccessV1({
      ...input(metadataPort, contentPort),
      claim: {
        claimClass: 'CHARACTER_FACT_CLAIM',
        evidenceState: 'no_authoritative_support',
      },
    });

    expect(result.status).toBe('retrieved');
    expect(result.preflight?.claimIntegrity).toMatchObject({
      result: 'UNVERIFIED',
      mayTreatPremiseAsAuthoritativeFact: false,
    });
    expect(result.preflight?.disclosure.result).toBe('ALLOW');
  });

  it('fails closed when fact authority metadata is absent or provenance is incomplete', async () => {
    const missingMetadataPort = new MetadataPort(null);
    const contentPort = new ContentPort(content());

    await expect(
      prepareCharacterRuntimeFactAccessV1(
        input(missingMetadataPort, contentPort),
      ),
    ).rejects.toMatchObject({
      code: 'FACT_METADATA_UNAVAILABLE',
    });

    const badMetadataPort = new MetadataPort(
      metadata({
        sourceRevision: ' ',
      }),
    );

    await expect(
      prepareCharacterRuntimeFactAccessV1(input(badMetadataPort, contentPort)),
    ).rejects.toMatchObject({
      code: 'FACT_METADATA_PROVENANCE_INVALID',
    });
    expect(contentPort.calls).toHaveLength(0);
  });

  it('fails closed when metadata or content identity/provenance drifts between phases', async () => {
    const mismatchedMetadataPort = new MetadataPort(
      metadata({
        characterId: 'yeoul',
      }),
    );
    const contentPort = new ContentPort(content());

    await expect(
      prepareCharacterRuntimeFactAccessV1(
        input(mismatchedMetadataPort, contentPort),
      ),
    ).rejects.toMatchObject({
      code: 'FACT_METADATA_IDENTITY_MISMATCH',
    });
    expect(contentPort.calls).toHaveLength(0);

    const metadataPort = new MetadataPort(metadata());
    const staleContentPort = new ContentPort(
      content({
        sourceRevision: 'bible:stale-rev',
      }),
    );

    await expect(
      prepareCharacterRuntimeFactAccessV1(
        input(metadataPort, staleContentPort),
      ),
    ).rejects.toMatchObject({
      code: 'FACT_CONTENT_PROVENANCE_MISMATCH',
    });
  });

  it('fails closed when the content port returns a different depth than authorized', async () => {
    const metadataPort = new MetadataPort(metadata());
    const contentPort = new ContentPort(
      content({
        depth: 'surface',
      }),
    );

    await expect(
      prepareCharacterRuntimeFactAccessV1(
        input(metadataPort, contentPort),
      ),
    ).rejects.toMatchObject({
      code: 'FACT_CONTENT_DEPTH_MISMATCH',
    });
  });

  it('uses typed access errors for invalid identifiers', async () => {
    const metadataPort = new MetadataPort(metadata());
    const contentPort = new ContentPort(content());

    await expect(
      prepareCharacterRuntimeFactAccessV1({
        ...input(metadataPort, contentPort),
        factKey: '   ',
      }),
    ).rejects.toBeInstanceOf(CharacterRuntimeFactAccessErrorV1);
    expect(metadataPort.calls).toBe(0);
    expect(contentPort.calls).toHaveLength(0);
  });
});
