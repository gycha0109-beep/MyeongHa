-- Watchtower-Track: character-memory
-- Server-approved GLM renderer policy, with conservative full-context reservation.
-- Does not grant new table privileges or modify the existing OpenAI policy.
-- An absent OpenRouter key still uses the already-governed OpenAI renderer.
insert into public.seyeon_ai_governor_model_policies_v1(
  provider_key,model_key,policy_version,price_version,allowed_purposes,
  context_window_tokens,maximum_input_tokens,maximum_output_tokens,
  maximum_serialized_request_bytes,input_micro_usd_per_million,
  cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active
) values(
  'openrouter-chat','z-ai/glm-5.3-flash',
  'seyeon-glm53flash-context-capacity-20261031',
  'openrouter-glm53flash-list-20261031',
  array['dialogue_render']::text[],
  1048576,1047040,1536,131072,150000,150000,500000,true
) on conflict(provider_key,model_key,policy_version) do nothing;
