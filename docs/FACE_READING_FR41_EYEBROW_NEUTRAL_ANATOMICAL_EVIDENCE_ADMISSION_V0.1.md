# FACE READING FR-41 — Eyebrow Neutral Anatomical Evidence Admission v0.1

## Status

**External neutral eyebrow target model supported / MediaPipe component mapping unresolved / no research candidate admitted**

FR-40 established that exact MediaPipe `v0.10.35` source and installed `@mediapipe/tasks-vision@0.10.35` agree on the eyebrow edge sets, but MediaPipe assigns no separate anatomical or neutral role to the two disconnected eyebrow components.

FR-41 asks a different question:

> Is there external, non-physiognomic facial anatomy / morphometrics evidence for what a reproducible neutral eyebrow representation should look like?

The answer is **yes for the target model, but no for the provider mapping**.

## Reviewed external evidence

### Fagertun et al. (2014)

**3D facial landmarks: Inter-operator variability of manual annotation**  
DOI: `10.1186/1471-2342-14-35`  
PMCID: `PMC4205300`

Reviewed contribution:

- right/left eyebrow medial anatomical points
- right/left eyebrow lateral anatomical points
- additional eyebrow pseudo-landmarks
- measured annotation variability

Important limitation: eyebrow landmarks, especially lateral eyebrow points, showed relatively high manual annotation variability. This is useful neutral evidence for landmark definition and also evidence that repeatability/calibration cannot be assumed.

### Windhager et al. (2019)

**Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause**  
DOI: `10.1002/ajpa.23878`  
PMCID: `PMC6771603`

Reviewed eyebrow protocol:

- `Superciliare mediale`
- `Superciliare laterale`
- four sliding landmarks along the **lower rim** of each eyebrow
- four sliding landmarks along the **upper rim** of each eyebrow

This establishes a neutral morphometric precedent for representing an eyebrow with medial/lateral endpoints and separate upper/lower boundary curves.

### Kleisner, Trnka & Tureček (2025)

**FACEDIG automated tool for placing landmarks on facial portraits for geometric morphometrics users**  
DOI: `10.1038/s41598-025-09714-4`  
PMCID: `PMC12234795`

Reviewed eyebrow protocol:

- `SUPERCILIARE LATERALE`
- `SUPERCILIARE MEDIALE`
- regularly spaced semilandmarks on the eyebrow **upper curve**
- regularly spaced semilandmarks on the eyebrow **lower curve**

The paper uses standardized en-face photographs and an independent learned landmarking system. It does not authorize MediaPipe landmark identities.

## What FR-41 can conclude

Across multiple neutral facial morphology protocols, the following representation has independent precedent:

```text
medial eyebrow endpoint
+
lateral eyebrow endpoint
+
upper eyebrow boundary curve
+
lower eyebrow boundary curve
```

This is materially stronger neutral-anatomical evidence than selecting one arbitrary MediaPipe disconnected chain because it describes an anatomical target independent of provider serialization.

However, FR-41 does **not** conclude:

```text
MediaPipe component 1 = upper eyebrow boundary
MediaPipe component 2 = lower eyebrow boundary
```

or the reverse.

No reviewed source supplies that mapping.

## Candidate assessment

### A. Single provider component curve

External target evidence is insufficient to select one provider component.

Still blocked by:

- provider component role mapping
- left/right mapping reproducibility
- pose stability
- expression stability
- repeated capture repeatability
- calibration thresholds
- deterministic algorithm specification

### B. Paired provider components region

External literature provides **partial boundary-model support** because upper and lower eyebrow boundary curves are independently used in morphometric protocols.

But this does not establish:

- that MediaPipe's two components are those boundaries
- which component is upper/lower
- endpoint correspondence
- a region closure rule
- a production region algorithm

Therefore this candidate remains unadmitted.

### C. Correspondence-derived centerline

The reviewed literature does not directly establish an eyebrow centerline target, and MediaPipe cross-component correspondence remains unresolved.

This candidate remains unadmitted.

## Deterministic admission gates

FR-41 records ten ordered gates:

1. `external_neutral_target_model` — **SATISFIED**
2. `provider_component_role_mapping` — **BLOCKED**
3. `left_right_mapping_reproducibility` — **BLOCKED**
4. `component_endpoint_correspondence` — **BLOCKED**
5. `controlled_capture_protocol` — **BLOCKED**
6. `pose_stability` — **BLOCKED**
7. `expression_stability` — **BLOCKED**
8. `repeated_capture_repeatability` — **BLOCKED**
9. `calibration_error_thresholds` — **BLOCKED**
10. `deterministic_algorithm_spec` — **BLOCKED**

The gate ordering is deliberate. A production or research algorithm cannot be authorized merely because literature contains a plausible anatomical representation.

## Authority boundary

FR-41 keeps all of these false:

- literature upper/lower boundary model means MediaPipe component mapping
- MediaPipe source order means upper/lower role
- provider index means anatomical landmark authority
- aesthetic or normative eyebrow studies may define neutral geometry authority
- upper/lower boundary evidence means a closed-region algorithm is authorized
- upper/lower boundary evidence means a centerline algorithm is authorized
- a research candidate may be admitted while required gates remain blocked
- traditional physiognomy semantics may be projected into neutral geometry
- brow-midline algorithm authorization
- production Three Divisions metric authorization
- production F1 authorization
- production F6 authorization

## Why aesthetic eyebrow literature is excluded

Studies asking which eyebrow shape is attractive, ideal, preferred, youthful, masculine, feminine, or culturally desirable answer a **normative/aesthetic** question. They cannot define the neutral observation layer.

FR-41 admits only evidence whose relevant contribution is facial anatomy, anthropometry, geometric morphometrics, landmark reproducibility, or measurement protocol.

## Result

```text
external target-model evidence = READY
provider component mapping = NOT READY
research candidates admitted = 0
reviewed candidates = 0
algorithmRef = null for every candidate
production neutral eyebrow geometry = NOT READY
```

## Next slice

FR-42 should attack the first blocked gate directly:

```text
provider_component_role_mapping
```

A valid FR-42 experiment must compare exact MediaPipe eyebrow components against an independently defined upper/lower eyebrow reference on controlled neutral captures. It must not use provider serialization order as ground truth.

Until that evidence exists, FR-17 left/right brow derivations remain `blocked_unresolved`, brow-midline remains dependency-blocked, and Three Divisions / F1 / F6 remain unavailable.
