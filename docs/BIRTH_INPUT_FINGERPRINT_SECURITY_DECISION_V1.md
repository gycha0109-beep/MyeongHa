# MyeongHa Birth Input Fingerprint Security Decision V1

> Status: DECIDED — implementation security binding
> Date: 2026-09-03
> Scope: production Birth Profile input fingerprint generation only

## 1. Source-backed requirement

The authority-first DB design requires Birth input provenance to use a scheme/version-prefixed fingerprint and prefers keyed HMAC for low-entropy personal input. The fingerprint is integrity/idempotency provenance, not anonymization.

This document does not claim that the primary source defined the concrete environment variable, canonical byte serialization, HMAC domain string, or initial key version. Those are implementation reproducibility and security bindings selected here to satisfy the source-backed requirement without changing Birth product semantics.

## 2. Production V1 binding

```text
algorithm      = HMAC-SHA-256
stored format  = hmac-sha256:k1:<64 lowercase hex>
key version    = k1
domain         = myeongha.birth-input.v1
secret env     = MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET
minimum secret = 32 UTF-8 bytes
```

The Birth HMAC secret is server-only and independent from the Guest bearer fingerprint secret. It must not be accepted from a client request, written to PostgreSQL, returned by an API, or emitted to logs.

## 3. Canonical Birth bytes

After the existing Birth request parser has produced `BirthInputV1`, the canonical payload is UTF-8 `JSON.stringify` of this fixed-order array:

```text
[
  calendarType,
  birthDate,
  birthTime,
  timeKnown,
  isLeapMonth,
  sex
]
```

The HMAC message is:

```text
UTF8("myeongha.birth-input.v1")
+ 0x00
+ UTF8(canonical payload)
```

The fixed-order array is deliberate. Fingerprints must not depend on JavaScript object insertion order, and `null`, booleans, strings, and distinct Birth fields must remain distinguishable.

## 4. Rotation

`k1` is the first actual production Birth fingerprint key version. The ERD example `hmac-sha256:k2:<hex>` is a format example and is not treated as evidence that production must begin at `k2`.

A future rotation must introduce an explicit new key version and server configuration rather than silently replacing the bytes behind `k1`. Historical `input_hash` values retain their version prefix. An old key is retained only when a future retry/provenance verification path actually needs recomputation of that historical fingerprint.

## 5. Boundary

This decision does **not** activate `POST /api/birth-profiles` by itself. It does not grant `myeongha_api_executor` Birth write privileges or command EXECUTE, add RLS write policies, create a public Vercel POST handler, or bind a production secret value.

Production POST activation still requires a separately reviewed subject-scoped PostgreSQL write-authority slice and an explicit production environment binding for the Birth HMAC secret.
