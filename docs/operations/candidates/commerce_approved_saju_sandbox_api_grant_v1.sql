-- Separate approval boundary. Rehearse only on an isolated DB.
grant execute on function
  public.select_approved_saju_checkout_v1(uuid,text,text,uuid),
  public.resolve_approved_purchase_admission_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid),
  public.create_approved_purchase_intent_v1(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text,text,text),
  public.create_approved_saju_sandbox_attempt_v1(uuid,uuid,uuid,text,text,text),
  public.read_approved_saju_sandbox_handoff_v1(uuid,uuid,text),
  public.qry_approved_saju_sandbox_verification_context_v1(uuid,uuid),
  public.qry_approved_saju_component_record_v1(uuid,uuid,text,boolean),
  public.qry_approved_saju_purchase_readings_v1(uuid,uuid),
  public.qry_approved_saju_reading_history_v1(uuid,timestamptz,timestamptz,uuid,integer)
  to myeongha_api_executor;
