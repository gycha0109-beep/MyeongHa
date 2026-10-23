-- Se-yeon R2 forward-only, fail-closed receipt NULL remediation proposal.
-- Watchtower-Track: ops
-- HOLD_OWNER_REVIEW: not authorized for Production deployment or paid calls.
-- Requires pinned originals 1700 and 1710, which remain unchanged.
-- Revalidate existing rows rather than marking a potentially broken constraint NOT VALID.
-- Any incompatible historical rows abort this entire transaction; never delete them.

begin;
set local lock_timeout = '5s';

alter table public.seyeon_ai_call_cost_events
  drop constraint seyeon_ai_governor_receipt_pin_shape_v1,
  add constraint seyeon_ai_governor_receipt_pin_shape_v1 check (
    (governor_receipt_pinned_at is null
     and governor_input_rate_micro_usd_per_million is null
     and governor_cached_input_rate_micro_usd_per_million is null
     and governor_output_rate_micro_usd_per_million is null)
    or
    (governor_receipt_pinned_at is not null
     and governor_bucket_utc_date is not null
     and governor_input_rate_micro_usd_per_million is not null
     and governor_cached_input_rate_micro_usd_per_million is not null
     and governor_output_rate_micro_usd_per_million is not null
     and governor_input_rate_micro_usd_per_million > 0
     and governor_cached_input_rate_micro_usd_per_million >= 0
     and governor_output_rate_micro_usd_per_million > 0)
  );

-- Defense in depth at the durable write boundary. The original Store RPC
-- uses NOT IN; if a required JSON key is absent, that expression can become
-- SQL UNKNOWN. This constraint rejects missing, JSON-null, non-string or
-- non-enumerated values even if that RPC's IF guard is bypassed by NULL.
-- Preserve the existing Store/Claim/Ack function owner, ACL and RLS unchanged.
alter table public.seyeon_ai_provider_receipt_queue_v1
  add constraint seyeon_provider_queue_required_enums_v1 check (
    (provider_event->>'outcome') is not null
    and (provider_event->>'costStatus') is not null
    and jsonb_typeof(provider_event->'outcome') = 'string'
    and jsonb_typeof(provider_event->'costStatus') = 'string'
    and (provider_event->>'outcome') in (
      'response_received','http_failure','network_failure','timeout',
      'invalid_content_type','invalid_response'
    )
    and (provider_event->>'costStatus') in ('estimated','usage_unknown')
  );

commit;
