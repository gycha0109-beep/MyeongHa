\set ON_ERROR_STOP on
-- Disposable PG17: common historical transcript authorization and isolation.
CREATE ROLE myeongha_api_executor NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA seyeon_private;
CREATE TABLE public.subjects(id uuid PRIMARY KEY,status text,merged_into_subject_id uuid);
CREATE TABLE public.conversation_threads(id uuid PRIMARY KEY,subject_id uuid,status text);
CREATE TABLE public.conversation_thread_characters(id uuid PRIMARY KEY,thread_id uuid,character_id text);
CREATE TABLE public.chat_turns(id uuid PRIMARY KEY,subject_id uuid,thread_id uuid,state text,delivered_at timestamptz,committed_attempt_id uuid);
CREATE TABLE public.chat_turn_attempts(id uuid PRIMARY KEY,subject_id uuid,turn_id uuid,state text,committed_message_id uuid,seyeon_positive_delivery_received_at timestamptz);
CREATE TABLE public.conversation_messages(
 id uuid PRIMARY KEY,subject_id uuid,thread_id uuid,turn_id uuid,sequence_no bigint,
 sender_type text,thread_character_id uuid,body_text text,message_schema_version text,
 created_at timestamptz,redacted_at timestamptz);
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.assert_myeongha_subject_context_v1(p_subject uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_subject IS DISTINCT FROM nullif(current_setting('history.subject',true),'')::uuid
 THEN RAISE EXCEPTION USING errcode='42501'; END IF;
END $$;
CREATE FUNCTION seyeon_private.assert_current_original_assistant_lineage_v1(
 p_subject uuid,p_thread uuid,p_message uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.assert_myeongha_subject_context_v1(p_subject);
 IF current_setting('history.revoke',true)='true' THEN
   RAISE EXCEPTION USING errcode='42501',message='private grant revoked';
 END IF;
END $$;

\ir ../../scripts/operations/chat-history/production-01-owner-history-read.sql

INSERT INTO public.subjects VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',NULL),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active',NULL);
INSERT INTO public.conversation_threads VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active');
INSERT INTO public.conversation_thread_characters VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cccccccc-cccc-4ccc-8ccc-cccccccccccc','seyeon'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','cccccccc-cccc-4ccc-8ccc-cccccccccccc','yeoul');

INSERT INTO public.chat_turns VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','delivered',now(),'11111111-1111-4111-8111-111111111119'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','failed_retryable',null,null),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','abandoned',null,null),
 ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committed',null,'44444444-4444-4444-8444-444444444449');
INSERT INTO public.chat_turn_attempts VALUES
 ('11111111-1111-4111-8111-111111111119','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','committed','00000000-0000-4000-8000-000000000002',now()),
 ('44444444-4444-4444-8444-444444444449','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','committed','00000000-0000-4000-8000-000000000004',null);
INSERT INTO public.conversation_messages VALUES
 ('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',1,'user',null,'User previous', 'v1',now(),null),
 ('00000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',2,'character','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Se-yeon previous answer','v1',now(),null),
 ('00000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',3,'user',null,'Retry this message','v1',now(),null),
 ('00000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','44444444-4444-4444-8444-444444444444',4,'character','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Unsent assistant secret','v1',now(),null),
 ('00000000-0000-4000-8000-000000000005','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333',5,'user',null,'Abandoned original','v1',now(),null),
 ('00000000-0000-4000-8000-000000000006','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,6,'character','ffffffff-ffff-4fff-8fff-ffffffffffff','Yeoul legacy reply','v1',now(),null),
 ('00000000-0000-4000-8000-000000000007','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,7,'user',null,'Redacted secret','v1',now(),now()),
 ('00000000-0000-4000-8000-000000000008','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',null,1,'character',null,'Another account secret','v1',now(),null);

SET ROLE myeongha_api_executor;
SELECT set_config('history.subject','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $assert$
DECLARE n int; x record;
BEGIN
 IF has_table_privilege(current_user,'public.conversation_messages','SELECT')
 THEN RAISE EXCEPTION 'Unexpected table SELECT privilege'; END IF;
 SELECT count(*) INTO n
 FROM public.qry_chat_thread_owner_visible_history_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',0,50);
 IF n<>6 THEN RAISE EXCEPTION 'Expected 6 visible history positions; got %',n; END IF;
 SELECT * INTO x FROM public.qry_chat_thread_owner_visible_history_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,50)
 WHERE sequence_no=3;
 IF x.turn_state<>'failed_retryable' OR x.body_text<>'Retry this message'
 THEN RAISE EXCEPTION 'Failed Turn must remain readable'; END IF;
 IF EXISTS (SELECT 1 FROM public.qry_chat_thread_owner_visible_history_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',0,50)
 WHERE body_text='Unsent assistant secret' OR body_text='Redacted secret')
 THEN RAISE EXCEPTION 'Protected or unsent material leaked'; END IF;
 BEGIN
   PERFORM 1 FROM public.qry_chat_thread_owner_visible_history_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',0,50);
   RAISE EXCEPTION 'Other-owner access was not denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $assert$;
SELECT set_config('history.revoke','true',false);
DO $assert$
DECLARE x record;
BEGIN
 SELECT * INTO x FROM public.qry_chat_thread_owner_visible_history_v1(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',0,50)
 WHERE sequence_no=2;
 IF x.body_text IS NOT NULL OR NOT x.redacted THEN
   RAISE EXCEPTION 'Revoked assistant source remained exposed';
 END IF;
END $assert$;
RESET ROLE;
DO $acl$
BEGIN
 IF has_function_privilege('authenticated',
   'public.qry_chat_thread_owner_visible_history_v1(uuid,uuid,bigint,integer)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'Authenticated role unexpectedly allowed'; END IF;
END $acl$;
SELECT 'COMMON_CHAT_HISTORY_PG17_OK' AS result;
