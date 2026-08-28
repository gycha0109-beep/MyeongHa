# MyeongHa Face Reading FR-18 — Published Artifact Identity Addendum v0.2

Status: research-only evidence refinement
Scope: `@mediapipe/tasks-vision@0.10.35` consumer-resolved npm artifact identity
Baseline: FR-18 provider release/laterality attestation v0.1

## 1. What changed

The pinned K_beauty repository contains stronger artifact evidence than the package manifest alone.

Pinned consumer repository:

```text
gycha0109-beep/K_beauty
commit: 81c3b4139efdffc785439da005557dc38a6b4873
```

Its inspected lockfile is:

```text
path: package-lock.json
blob: 2fdca4f4498617f383b9579191415efe0c8e743b
```

The exact `node_modules/@mediapipe/tasks-vision` entry resolves:

```text
version:
0.10.35

resolved:
https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz

integrity:
sha512-HOvadwVRE6JC+45nyYhmnywnr5h/J8KZvOeUNVOG9q/0875pZgItznFB9bRTvLc264YSJqiZ1NsIpCStJw/egg==
```

FR-18 v0.2 therefore records the consumer-resolved artifact identity as:

```text
artifactIdentityState = consumer_lockfile_attested
```

## 2. What this evidence means

The lockfile now answers a narrower question exactly:

```text
Which npm tarball + integrity value is the pinned K_beauty consumer resolved to?
```

It does **not** answer:

```text
Which upstream git commit/build invocation produced that published tarball?
```

Nor does it establish:

```text
that the left/right eye/eyebrow topology bytes in vision_bundle.mjs
are source/build-equivalent to the inspected upstream TypeScript snapshot.
```

The distinction is deliberate.

## 3. No fake independent rehash

FR-18 v0.2 records:

```text
tarballBytesIndependentlyRehashed = false
```

The repository inspection verified the lockfile's exact URL and SRI value. It did not independently fetch the registry tarball bytes and recompute the SHA-512 digest inside the MyeongHa evidence process.

Therefore the attestation must not be worded as if MyeongHa independently verified registry bytes against the SRI.

## 4. No source equivalence promotion

FR-18 v0.2 records:

```text
sourceEquivalenceEstablished = false
releaseExactState = unresolved
publishedBundleTopologyEvidenceRef = null
providerActivationAllowed = false
```

A new prohibited promotion is explicit:

```text
consumer_lockfile_integrity_to_source_equivalence
```

This prevents the following invalid inference:

```text
package-lock contains SHA-512 SRI
→ therefore upstream commit 9d38d191... produced this artifact
```

That inference is not supported.

## 5. Development source snapshot remains bounded

The existing upstream evidence remains:

```text
repository:
google-ai-edge/mediapipe

version bump commit:
9d38d191b060cbfeaeb0c1aa20e47201f032ea35

topology source:
mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts

blob:
644de9d8c7cd90880d92b2393b4913fa93ace927
```

The source contains the named connection sets:

```text
FACE_LANDMARKS_LEFT_EYE
FACE_LANDMARKS_RIGHT_EYE
FACE_LANDMARKS_LEFT_EYEBROW
FACE_LANDMARKS_RIGHT_EYEBROW
```

But the version file describes the bumped version as the next/currently-in-development version. FR-18 therefore continues to classify this as:

```text
development_version_source_snapshot
```

not release-exact publication provenance.

## 6. Published package metadata remains bounded

Public package metadata for `@mediapipe/tasks-vision@0.10.35` identifies:

```text
browser/module entry = vision_bundle.mjs
type entry           = vision.d.ts
```

That still does not attest the topology bytes.

Therefore:

```text
publishedPackageMetadata.topologyBytesAttested = false
```

remains unchanged.

## 7. Laterality remains separate

The new npm artifact identity evidence changes nothing about anatomical left/right.

Still prohibited:

```text
provider LEFT/RIGHT symbol
→ anatomical side

image x ordering
→ anatomical side

selfie preview orientation
→ saved/canonical pixel orientation
```

FR-19 and FR-21B remain the capture-orientation authority boundary.

## 8. Current exact state

After this addendum:

```text
consumer dependency version              = exact
consumer lockfile resolution              = exact
consumer-resolved tarball URL             = exact
consumer lockfile SRI                     = exact
independent registry tarball rehash        = not performed
published bundle topology byte attestation = absent
source/build linkage                       = unresolved
releaseExactState                          = unresolved
providerActivationAllowed                  = false
```

## 9. Evidence still required to close release exactness

One valid future path would require a chain such as:

```text
published npm artifact bytes
+ independently verified cryptographic digest
+ authoritative build/source linkage
+ published bundle topology extraction/verification
```

Alternatively MyeongHa may define and independently version its own Face Observation Provider Contract, validate an implementation against that contract, and keep third-party package source provenance outside the semantic authority boundary.

Neither path is claimed by FR-18 v0.2.
