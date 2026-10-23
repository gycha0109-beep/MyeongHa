-- R2-H/1750 nondeployable Creator role membership cleanup proposal.
-- Watchtower-Track: ops
-- HOLD_OWNER_REVIEW; never Production, migration repair or other external execution.
-- Pinned original 1530 is not modified.
begin;
set local lock_timeout='5s';
do $guard$
declare owner_role oid;
begin
 select oid into owner_role from pg_catalog.pg_roles
  where rolname='myeongha_character_reading_artifact_runtime_owner'
   and not rolcanlogin and not rolsuper and not rolcreatedb
   and not rolcreaterole and not rolinherit and not rolreplication
   and not rolbypassrls;
 if owner_role is null
    or not exists (select 1 from pg_catalog.pg_auth_members
       where roleid=owner_role and member=(
         select oid from pg_catalog.pg_roles where rolname=current_user))
    or not exists (select 1 from pg_catalog.pg_proc p
       where p.oid=to_regprocedure('public.cmd_commit_character_face_governed_reading_artifact_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)')
       and p.proowner=owner_role and p.prosecdef) then
   raise exception 'HOLD_R2_H_1750_CREATOR_ROLE_OR_OWNER_PRECONDITION_FAILED';
 end if;

 -- In PG17 role membership is grantor-scoped. An ADMIN OPTION on its own
 -- does not prove current_user can revoke a different grantor's membership.
 -- Fail before REVOKE, including ambiguous multiple-grantor memberships.
 if (select count(*) from pg_catalog.pg_auth_members
       where roleid=owner_role and member=current_user::regrole) <> 1
    or not exists (select 1 from pg_catalog.pg_auth_members
       where roleid=owner_role and member=current_user::regrole
         and grantor=current_user::regrole) then
   raise exception 'HOLD_R2_H_1750_GRANTOR_NOT_CREATOR';
 end if;
end
$guard$;
revoke myeongha_character_reading_artifact_runtime_owner from current_user;
do $verify$
begin
 -- A PostgreSQL superuser can report pg_has_role(..., 'MEMBER')=true
 -- without a direct pg_auth_members edge. Only revoke the exact explicit edge;
 -- do not claim to restrict a superuser's inherent effective privileges.
 if exists (select 1 from pg_catalog.pg_auth_members
       where roleid='myeongha_character_reading_artifact_runtime_owner'::regrole
         and member=current_user::regrole)
    or pg_catalog.has_schema_privilege(
       'myeongha_character_reading_artifact_runtime_owner','public','CREATE') then
   raise exception 'HOLD_R2_H_1750_CREATOR_MEMBERSHIP_RETAINED';
 end if;
end
$verify$;
commit;
