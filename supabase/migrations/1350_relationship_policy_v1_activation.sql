-- MyeongHa PHASE M1: bind the frozen Production Relationship Policy V1 artifact.
-- Watchtower-Track: character-memory
--
-- The payload below is the canonical JSON material of
-- PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1. The content hash is verified again
-- from TypeScript in repository tests so DB and domain policy cannot drift silently.

do $relationship_policy_v1_seed$
declare
  v_expected_hash constant text :=
    'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c';
  v_payload constant jsonb :=
    $policy$jsonb$
{"antiFarming":{"calendarAgeAloneCreatesProgression":false,"maxPositiveCreditsPerFamilyWindow":2,"rawMessageVolumeCreatesProgression":false,"rollingWindowDays":7,"unit":"CAUSAL_EPISODE","visitOnlyCreatesProgression":false},"authority":"source_owner_frozen_production_policy","behaviorAccess":{"OPEN_CONFLICT":"RESTRICTED_BY_CONFLICT","RESOLVED_RECENTLY":"CAUTIOUS_AFTER_REPAIR","STABLE":"STAGE_ALIGNED"},"condition":{"promotionRequires":"STABLE","repairMovesTo":"RESOLVED_RECENTLY","resolvedRecentlyReturnsToStableOn":"NEXT_NON_REPAIR_CREDITED_POSITIVE_CAUSAL_EPISODE","values":["STABLE","OPEN_CONFLICT","RESOLVED_RECENTLY"]},"eventRegistry":[{"causalRule":"NONE","characterBehaviorKeyPolicy":"FORBIDDEN","eventKind":"COMMITMENT_MADE","eventSchemaVersion":"1","family":"commitment","milestoneKind":null,"payloadKeys":["commitmentKey"],"polarity":"neutral","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":0,"trust":0}},{"causalRule":"COMMITMENT_OUTCOME","characterBehaviorKeyPolicy":"FORBIDDEN","eventKind":"COMMITMENT_KEPT","eventSchemaVersion":"1","family":"commitment","milestoneKind":"commitment_follow_through","payloadKeys":["commitmentKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":4,"friction":0,"trust":5}},{"causalRule":"COMMITMENT_OUTCOME","characterBehaviorKeyPolicy":"FORBIDDEN","eventKind":"COMMITMENT_BROKEN","eventSchemaVersion":"1","family":"commitment","milestoneKind":null,"payloadKeys":["commitmentKey"],"polarity":"negative","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":6,"trust":-8}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CHARACTER_DETAIL_REMEMBERED","eventSchemaVersion":"1","family":"recognition","milestoneKind":"recognition","payloadKeys":["detailKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":3,"friction":0,"trust":4}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CARE_ACCEPTED_BY_CHARACTER","eventSchemaVersion":"1","family":"care","milestoneKind":"care","payloadKeys":["careKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":3,"friction":0,"trust":4}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CARE_REQUESTED_BY_CHARACTER","eventSchemaVersion":"1","family":"care","milestoneKind":"care","payloadKeys":["careKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":3,"friction":0,"trust":5}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CHARACTER_SELF_DISCLOSURE","eventSchemaVersion":"1","family":"disclosure","milestoneKind":null,"payloadKeys":["topicKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":2,"friction":0,"trust":2}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CHARACTER_VULNERABILITY_REVEALED","eventSchemaVersion":"1","family":"vulnerability","milestoneKind":"vulnerability","payloadKeys":["topicKey"],"polarity":"positive","progressionEligible":true,"scoreDelta":{"closeness":4,"friction":0,"trust":4}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"RELATIONAL_EXPECTATION_INVALIDATED","eventSchemaVersion":"1","family":"conflict_repair","milestoneKind":null,"payloadKeys":["expectationKey"],"polarity":"negative","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":10,"trust":-10}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"CONFLICT_OPENED","eventSchemaVersion":"1","family":"conflict_repair","milestoneKind":null,"payloadKeys":["conflictKey"],"polarity":"negative","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":8,"trust":-6}},{"causalRule":"CONFLICT_REPAIR","characterBehaviorKeyPolicy":"OPTIONAL_NAMESPACED","eventKind":"RECONCILIATION","eventSchemaVersion":"1","family":"conflict_repair","milestoneKind":null,"payloadKeys":["resolutionKey"],"polarity":"repair","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":-6,"trust":0}},{"causalRule":"NONE","characterBehaviorKeyPolicy":"FORBIDDEN","eventKind":"RETURN_AFTER_ABSENCE","eventSchemaVersion":"1","family":"return","milestoneKind":null,"payloadKeys":["observationKey"],"polarity":"neutral","progressionEligible":false,"scoreDelta":{"closeness":0,"friction":0,"trust":0}}],"policyVersion":"relationship-policy-v1","repair":{"advancesAttainedDepthDirectly":false,"milestoneCredit":0,"positiveProgressionCredit":0},"replay":{"historicalEventRewriteAllowed":false,"llmInsideReplay":false,"policyUpgradeDefault":"PROSPECTIVE_ONLY","strategy":"SNAPSHOT_ASSISTED_APPEND_ONLY_DETERMINISTIC_REPLAY","zeroPositiveEffectEventConsumesRevision":true},"schemaVersion":"relationship-policy-definition-v1","scores":{"automaticInactivityDecay":false,"bounds":{"closeness":[0,100],"friction":[0,100],"trust":[0,100]},"positiveSoftCap":"DISABLED","qualitativeHistoryAuthority":"CAUSAL_EPISODE_PROFILE"},"stageGates":{"S1_FAMILIAR":{"common":{"creditedPositiveEpisodes":2,"distinctPositiveDays":2},"scoreFloor":{"closeness":10,"trust":5}},"S2_REGULAR":{"diverseOrganic":{"creditedPositiveEpisodes":6,"positiveFamilies":3,"positiveWeeks":4},"scoreFloor":{"closeness":25,"trust":20},"sustainedNarrow":{"positiveFamilies":2,"positiveWeeks":8}},"S3_OPENED":{"diverseOrganic":{"creditedPositiveEpisodes":16,"milestones":1,"positiveFamilies":4,"positiveWeeks":10},"scoreFloor":{"closeness":55,"trust":50},"sustainedNarrow":{"milestones":1,"positiveFamilies":2,"positiveWeeks":20}},"S4_SPECIAL":{"diverseOrganic":{"creditedPositiveEpisodes":32,"milestones":3,"positiveFamilies":4,"positiveWeeks":20},"scoreFloor":{"closeness":80,"trust":75},"sustainedNarrow":{"milestones":3,"positiveFamilies":2,"positiveWeeks":40}}},"stages":{"correctionRetractionReplayMayLowerAttainedStage":true,"order":["S0_FIRST_MEETING","S1_FAMILIAR","S2_REGULAR","S3_OPENED","S4_SPECIAL"],"ordinaryConflictMayRegressAttainedStage":false,"s4IsRomanceConfirmation":false,"semantics":{"S0_FIRST_MEETING":"relationship formation not yet established","S1_FAMILIAR":"familiar and recognized recurring counterpart","S2_REGULAR":"sustained regular relationship","S3_OPENED":"high openness and trust","S4_SPECIAL":"special relational importance distinct from ordinary relationships"}}}
$policy$jsonb$::jsonb;
begin
  if exists (
    select 1
    from public.relationship_policy_artifacts p
    where p.policy_version = 'relationship-policy-v1'
      and (
        p.content_hash is distinct from v_expected_hash
        or p.artifact_schema_version is distinct from 'relationship-policy-definition-v1'
        or p.artifact_jsonb is distinct from v_payload
      )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_policy_v1_seed_identity',
      message = 'relationship-policy-v1 already exists with different immutable material';
  end if;

  if not exists (
    select 1
    from public.relationship_policy_artifacts p
    where p.policy_version = 'relationship-policy-v1'
  ) then
    insert into public.relationship_policy_artifacts(
      policy_version,
      artifact_schema_version,
      content_hash,
      artifact_jsonb,
      created_at,
      retired_at
    ) values (
      'relationship-policy-v1',
      'relationship-policy-definition-v1',
      v_expected_hash,
      v_payload,
      timestamptz '2026-09-28 00:00:00+00',
      null
    );
  end if;

  if not exists (
    select 1
    from public.relationship_policy_activations a
    where a.id = 'a1350000-0000-4000-8000-000000000001'::uuid
  ) then
    insert into public.relationship_policy_activations(
      id,
      policy_version,
      policy_content_hash,
      character_id,
      effective_from,
      activation_ref,
      created_at
    ) values (
      'a1350000-0000-4000-8000-000000000001',
      'relationship-policy-v1',
      v_expected_hash,
      null,
      timestamptz '2026-09-28 00:00:00+00',
      'migration:1350:relationship-policy-v1',
      timestamptz '2026-09-28 00:00:00+00'
    );
  end if;

  if not exists (
    select 1
    from public.relationship_policy_activations a
    where a.id = 'a1350000-0000-4000-8000-000000000001'::uuid
      and a.policy_version = 'relationship-policy-v1'
      and a.policy_content_hash = v_expected_hash
      and a.character_id is null
      and a.effective_from = timestamptz '2026-09-28 00:00:00+00'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_policy_v1_activation_identity',
      message = 'relationship-policy-v1 activation identity does not match the frozen binding';
  end if;
end
$relationship_policy_v1_seed$;
