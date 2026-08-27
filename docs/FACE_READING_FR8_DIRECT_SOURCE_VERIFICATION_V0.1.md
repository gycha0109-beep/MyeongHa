# Face Reading FR-8 — Direct Source Verification Authority v0.1

Status: **direct-witness workflow implemented / target page not yet verified / no source promotion**

## 1. Why FR-8 exists

FR-7 separated later transmission corroboration from direct witness verification.

FR-8 closes the next gap: even when another scanned edition of the same work becomes available, that edition must not silently upgrade a different witness.

```text
same work
!=
same witness
```

A scan-checked 1786 passage may establish a passage in the 1786 witness.

It does not automatically change:

```text
witness.shenxiang_quanbian.nlc_1925
witness.shenxiang_quanbian.ctext
```

or their passage verification states.

## 2. New direct scan candidate

Wikimedia Commons exposes:

```text
SSID-13003394 神相全編 卷2.pdf
```

Metadata currently established from the Commons file record:

```text
edition: 寶翰樓刊本
publication year: 1786
volume: 卷2
pages: 86
file size: 13,946,173 bytes
SHA-1: 3f2388c7a8f70c564d1e04fa8bdb059ce8a25365
```

URL:

https://commons.wikimedia.org/wiki/File:SSID-13003394_神相全編_卷2.pdf

The Commons catalog confirms that the larger Shenxiang work places `五官說` in 卷2, and independent electronic transcriptions place `審辨官` under that chapter.

This makes the split scan a strong **page-location candidate**, but not yet a verified passage.

## 3. Current executable state

The candidate is registered as:

```text
candidate.shenxiang_baohanlou_1786.volume2@0.1.0

state = witness_verified_passage_unlocated
mayPromoteOtherWitness = false
```

No `scanPage` is invented.

No original passage text is copied into a `scan_checked` direct passage without visual page inspection.

## 4. Page verification contract

A page can become `scan_checked` only through a `DirectSourcePageVerificationRecord` containing:

```text
exact candidate ref
exact witness id
new passage id
chapter
scan page
original text
visual evidence refs
checker refs
state
```

The validator requires:

- scan page inside witness page count;
- non-empty exact passage text;
- non-empty visual evidence refs;
- non-empty checker refs;
- matching candidate/witness identity;
- at least two checker refs for `double_checked`;
- `mayPromoteOtherWitness=false`.

## 5. Passage materialization

Only a validated page-verification record can be materialized as `SourcePassage`.

```text
scan_checked record
→ SourcePassage {
    witnessId = the candidate witness
    verificationStatus = scan_checked
  }
```

`double_checked` maps only to that same passage/witness as `double_checked`.

There is no API that mutates another witness's passage state.

## 6. Why the existing Shenxiang passage stays unchanged

Current Five Officers source in the engine:

```text
passage.shenxiang.five_officers.discernment
witness.shenxiang_quanbian.ctext
verificationStatus = unverified_ocr
```

The 1925 NLC full scan is also a distinct witness.

Finding an older 1786 scan improves research options and can independently corroborate the work, but provenance remains witness-specific.

## 7. Current blocking point

The target page inside the 86-page split PDF is not yet visually verified in the available browsing path.

Therefore FR-8 deliberately ships:

```text
pageVerifications = []
```

and does **not** claim:

- a scan page number;
- `scan_checked` 審辨官 text;
- direct-source production authorization;
- human calibration collection readiness;
- production `梁柱端直` threshold.

## 8. Next research operation

1. open the 1786 卷2 scan with page-level visual access;
2. locate `五官說 / 審辨官`;
3. record the exact scan page and visible text;
4. create a verification record with visual evidence;
5. independently re-check before `double_checked`;
6. materialize a **new 1786 passage**;
7. compare it against CText, 1925 NLC, and 古今圖書集成 transmission witnesses;
8. only then review whether the methodology source set should include that new witness passage.

The production boundary remains unchanged until those steps are complete.
