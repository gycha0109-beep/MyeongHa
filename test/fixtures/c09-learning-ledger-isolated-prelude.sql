create role anon nologin;
create role authenticated nologin;
create table public.characters(character_id text primary key);
insert into public.characters(character_id) values ('seyeon');
