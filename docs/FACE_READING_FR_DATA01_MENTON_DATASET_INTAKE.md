# FR-DATA-01 — Menton Validation Dataset Intake

## Purpose

FR-DATA-01 is operational tooling for receiving real capture assets into the existing FR-47 Menton validation path. It is **not** a new anatomical authority gate and it does not add thresholds.

The intake connects an FR-47 dataset manifest to actual local image files and verifies that the manifest is not merely self-reported metadata.

## Input manifest

Schema: `fr-data01-intake-v1`

```json
{
  "schemaVersion": "fr-data01-intake-v1",
  "dataset": { "schemaVersion": "fr47-dataset-v1", "...": "..." },
  "assets": [
    {
      "captureRef": "subject-001-baseline",
      "relativeAssetPath": "subject-001/baseline.jpg"
    }
  ]
}
```

`dataset` is validated by the existing FR-47 validator. `assets` must contain exactly one unique, root-relative POSIX path for every FR-47 capture and no extra capture references.

## File-level verification

The CLI resolves every asset below an explicitly supplied asset root and then verifies:

- the resolved real path remains inside that root, including after symlink resolution;
- the target is a regular file;
- the file has positive byte length;
- SHA-256 of the actual bytes exactly matches the capture's canonical `sha256:<64-hex>` digest;
- the bytes expose a PNG, JPEG, or WebP magic signature;
- distinct capture records do not reuse byte-identical asset digests.

The current intake deliberately does **not** claim that the image is fully decodable or that encoded pixel dimensions equal the FR-47 manifest dimensions. Those remain explicit `false` fields in the intake report rather than being inferred.

## Usage

Build first so the CLI imports the exact repository implementation:

```bash
npm run build
node scripts/face-reading-fr-data01-menton-dataset-intake.mjs \
  path/to/intake-manifest.json \
  path/to/asset-root \
  artifacts/face-reading/fr-data01-intake-report.json
```

On success the CLI emits `FR_DATA_01_INTAKE` and, when an output path is supplied, writes `fr-data01-intake-report-v1` JSON.

## Authority boundary

A successful intake means only that the FR-47 structure and supplied asset-byte provenance are internally consistent. It does **not** mean:

- the dataset is complete across all required subjects or capture strata;
- provider output exists;
- FR-48 empirical scoring has occurred;
- provider candidate → Menton mapping is validated;
- physical-repeat or pose stability is validated;
- calibration thresholds are defined;
- FR-35 chin contour binding is established;
- `地閣` equivalence is established;
- FR-36, 三停, F1, or F6 production authority is promoted.

The report embeds the ordinary FR-47 readiness assessment so incomplete real collection can be ingested incrementally without pretending that readiness or empirical validation has been achieved.

## Next evidence-bearing step

Use this intake for real, independently collected subject assets and provider-blind Me′ annotations. After a calibration/holdout dataset reaches FR-47 structural readiness and ground truth is frozen, provider execution and FR-48 descriptive scoring can begin. Holdout data remains unavailable for threshold tuning.
