The requested file reference is not currently visible. Use files.search or files.list to rediscover the file, then retry with a returned ref_id or file_id.

### Confirmed GEPA library-version blocker

Public gepa==0.1.4 exposes legacy API; the new OptimizeAnythingConfig exists in the newer upstream source but runtime/dependency lock and fake-evaluator behavior have not been verified. See GEPA_SOURCE_COMPATIBILITY.md. C remains partial; no user-paid calls.
