-- Disposable Postgres17 test fixture; subject IDs are synthetic.
insert into myeongha_internal.character_knowledge_topics_v1
(character_id, topic_key, policy_version, authority_source_ref, domain_policy, baseline, published_at)
values ('seyeon','python.programming','synthetic-c09','fixture:canon','bounded','explicit_unaware',now());

insert into myeongha_internal.character_learning_source_approvals_v1
(source_ref, owner_subject_id, character_id, topic_key, source_kind, awareness,
 visibility, approval_ref, approved_at, source_verification_ref, verified_at,
 learned_at, valid_at, privacy_review_ref, privacy_reviewed_at,
 sharing_consent_ref, deidentified_for_sharing)
values
('fixture:share:integration','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'seyeon','python.programming','user_taught_verified','heard_of','character_shared',
 'fixture:approval:integration',now(),'fixture:verified:integration',
 now()-interval '1 hour',now()-interval '1 day',now()-interval '1 day',
 'fixture:privacy:integration',now()-interval '1 hour',
 'fixture:consent:integration',true);

insert into myeongha_internal.character_learning_sharing_consents_v1
(consent_ref,source_ref,owner_subject_id,topic_key,state,revision,verified_at)
values ('fixture:consent:integration','fixture:share:integration',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','python.programming','active',1,
 now()-interval '1 hour');
