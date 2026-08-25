-- Make overlapping push-token shape violations report a stable constraint identity.
-- PostgreSQL evaluates CHECK constraints by constraint name; the encryption-key
-- completeness check must win when both key metadata and fingerprint are absent.

alter table public.device_installations
  rename constraint device_installations_token_fingerprint_shape_check
  to device_installations_token_shape_fingerprint_check;
