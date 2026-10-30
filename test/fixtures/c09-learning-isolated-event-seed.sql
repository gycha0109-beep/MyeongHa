-- Disposable fixture after c09-learning-least-privilege-isolated-postgres17.sql
-- The earlier fixture revokes fixture:src:A; use a distinct approved source.
insert into myeongha_internal.character_learning_source_approvals_v1
(source_ref,owner_subject_id,character_id,topic_key,source_kind,awareness,visibility,
 approval_ref,approved_at,source_verification_ref,verified_at,learned_at,valid_at,
 privacy_review_ref,privacy_reviewed_at,sharing_consent_ref,deidentified_for_sharing)
values ('fixture:event:A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'seyeon','python.programming','user_taught_verified','heard_of',
        'character_shared','fixture:approval:event:A',now(),
        'fixture:verified:event:A',now()-interval '1 hour',
        now()-interval '1 day',now()-interval '1 day',
        'fixture:privacy:event:A',now()-interval '1 hour',
        'fixture:consent:event:A',true);
insert into myeongha_internal.character_learning_sharing_consents_v1
(consent_ref,source_ref,owner_subject_id,topic_key,state,revision,verified_at)
values ('fixture:consent:event:A','fixture:event:A',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'python.programming','active',1,now()-interval '1 hour');
