-- 신규 설치 및 재실행 가능. 기존 데이터는 보존합니다.
begin;


do $$ begin
create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
create type public.document_status as enum ('draft', 'published', 'hidden');
exception when duplicate_object then null; end $$;
do $$ begin
create type public.document_type as enum ('student', 'teacher', 'club', 'project', 'event', 'place', 'term', 'other');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 20),
  avatar_url text,
  cohort smallint check (cohort between 1 and 2),
  grade smallint check (grade between 1 and 3),
  class_number smallint check (class_number between 1 and 10),
  role public.user_role not null default 'user',
  is_suspended boolean not null default false,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0
);

create table if not exists public.wiki_migrations (name text primary key);
revoke all on public.wiki_migrations from anon, authenticated;
do $$ begin
if not exists(select 1 from public.wiki_migrations where name='categories_seed') then
insert into public.categories (name, slug, sort_order) values
  ('학생', 'student', 10), ('선생님', 'teacher', 20), ('동아리', 'club', 30),
  ('프로젝트', 'project', 40), ('교내 행사', 'event', 50), ('학교 장소', 'place', 60),
  ('학교 용어', 'term', 70), ('기타', 'other', 80)
on conflict do nothing;
insert into public.wiki_migrations values('categories_seed');
end if;
end $$;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$$'),
  summary text check (char_length(summary) <= 300),
  content text not null default '',
  document_type public.document_type not null default 'other',
  category_id uuid references public.categories(id) on delete set null,
  thumbnail_url text,
  author_id uuid not null references public.profiles(id),
  status public.document_status not null default 'draft',
  edit_summary text check (char_length(edit_summary) <= 300),
  -- 학생·선생님 문서는 당사자가 명시적으로 동의해야 전체 공개됩니다.
  subject_consent boolean not null default false,
  is_locked boolean not null default false,
  is_featured boolean not null default false,
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  content text not null,
  edit_summary text check (char_length(edit_summary) <= 300),
  revision_number integer not null,
  created_at timestamptz not null default now(),
  unique (document_id, revision_number)
);

create table if not exists public.tags (id uuid primary key default gen_random_uuid(), name text not null unique check (char_length(name) between 1 and 30));
create table if not exists public.document_tags (
  document_id uuid references public.documents(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.comment_likes (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists documents_search_idx on public.documents using gin (to_tsvector('simple', title || ' ' || coalesce(summary, '') || ' ' || content));
create index if not exists comments_document_idx on public.comments(document_id, created_at);
create index if not exists revisions_document_idx on public.document_revisions(document_id, revision_number desc);

alter table public.profiles add column if not exists cohort smallint check (cohort between 1 and 2);
alter table public.documents add column if not exists edit_summary text check (char_length(edit_summary) <= 300);


-- RLS는 모든 앱 테이블에 적용합니다.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_revisions enable row level security;
alter table public.tags enable row level security;
alter table public.document_tags enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
grant usage on schema public to anon, authenticated;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists comments_updated on public.comments;
create trigger comments_updated before update on public.comments for each row execute function public.set_updated_at();
-- schema.sql에 포함되는 권한·저장 함수 정의. 단독 실행 전 schema.sql을 적용하세요.
alter table public.documents add column if not exists comments_locked boolean not null default false;
alter table public.documents add column if not exists subject_id uuid references public.profiles(id) on delete set null;
alter table public.documents add column if not exists subject_verified boolean not null default false;
alter table public.documents add column if not exists revision integer not null default 0;
alter table public.document_revisions add column if not exists snapshot jsonb;
alter table public.document_revisions add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists is_deleted boolean not null default false;
alter table public.comments add column if not exists is_pinned boolean not null default false;
alter table public.documents alter column author_id drop not null;
alter table public.documents drop constraint if exists documents_author_id_fkey;
alter table public.documents add constraint documents_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.comments alter column author_id drop not null;
alter table public.comments drop constraint if exists comments_author_id_fkey;
alter table public.comments add constraint comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
create table if not exists public.document_links (
  document_id uuid references public.documents(id) on delete cascade,
  related_id uuid references public.documents(id) on delete cascade,
  primary key(document_id,related_id), check(document_id <> related_id)
);
create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(), document_id uuid references public.documents(id) on delete cascade,
  requester_id uuid references public.profiles(id) on delete set null, reason text not null check(length(reason) between 1 and 500),
  resolved boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_id uuid, created_at timestamptz not null default now()
);

create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=auth.uid() and
    (not is_suspended or (suspended_until is not null and suspended_until <= now())))
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=auth.uid() and role='admin' and public.is_active_user())
$$;
create or replace function public.can_read_document(did uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from documents d where d.id=did and (
    public.is_admin() or d.author_id=auth.uid() or d.subject_id=auth.uid() or
    (d.status='published' and (d.document_type not in ('student','teacher') or
      (d.subject_verified and d.subject_consent and d.subject_id is not null)))))
$$;
create or replace function public.can_edit_document(did uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_active_user() and exists(select 1 from documents d where d.id=did and (
    public.is_admin() or (not d.is_locked and public.can_read_document(d.id) and
      (d.status='published' or d.author_id=auth.uid()))))
$$;
-- 이전에 작성자가 체크한 동의는 당사자 확인이 아니므로 subject_verified가 없으면 비공개입니다.
-- 재실행 시 기존 수정 번호와 본문을 보존합니다.
update public.documents d set revision=greatest(d.revision,coalesce((select max(revision_number) from document_revisions r where r.document_id=d.id),0));
drop trigger if exists document_revision_after_write on public.documents;
drop trigger if exists documents_updated on public.documents;
drop trigger if exists comments_limit_depth on public.comments;

-- 이 앱 테이블의 이전 정책을 모두 교체합니다. 행과 테이블은 삭제하지 않습니다.
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in
 ('profiles','documents','categories','tags','document_tags','document_revisions','comments','comment_likes','document_links','deletion_requests','activity_log')
 loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;
alter table public.document_links enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.activity_log enable row level security;
create policy read_profiles on public.profiles for select using (true);
create policy read_categories on public.categories for select using (true);
create policy read_documents on public.documents for select using (public.can_read_document(id));
create policy read_revisions on public.document_revisions for select using (public.can_read_document(document_id) and (not is_hidden or public.is_admin()));
create policy read_tags on public.tags for select using (true);
create policy read_document_tags on public.document_tags for select using(public.can_read_document(document_id));
create policy read_links on public.document_links for select using(public.can_read_document(document_id) and public.can_read_document(related_id));
create policy read_comments on public.comments for select using(public.can_read_document(document_id) and (not is_hidden or author_id=auth.uid() or public.is_admin()));
create policy read_likes on public.comment_likes for select using(exists(select 1 from comments c where c.id=comment_id));
create policy read_requests on public.deletion_requests for select to authenticated using(public.is_admin() or requester_id=auth.uid());
create policy read_activity on public.activity_log for select to authenticated using(public.is_admin());
revoke all on public.profiles, public.documents, public.categories, public.tags, public.document_tags,
 public.document_revisions, public.comments, public.comment_likes, public.document_links, public.deletion_requests, public.activity_log from anon, authenticated;
grant select on public.documents, public.categories, public.tags, public.document_tags, public.document_revisions,
 public.comments, public.comment_likes, public.document_links to anon, authenticated;
-- 학년/반/정지 정보는 공개하지 않습니다. 공개 작성자 표시는 별도 함수로 반환합니다.
grant select on public.profiles, public.deletion_requests, public.activity_log to authenticated;
drop policy read_profiles on public.profiles;
create policy read_profiles on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create or replace function public.author_labels() returns table(id uuid,nickname text,avatar_url text)
language sql stable security definer set search_path=public as $$
 select p.id,p.nickname,p.avatar_url from profiles p where p.id=auth.uid() or public.is_admin()
 or exists(select 1 from documents d where (d.author_id=p.id or d.subject_id=p.id) and public.can_read_document(d.id))
 or exists(select 1 from comments c where c.author_id=p.id and not c.is_hidden and public.can_read_document(c.document_id))
 or exists(select 1 from document_revisions r where r.editor_id=p.id and not r.is_hidden and public.can_read_document(r.document_id))
$$;
create or replace function public.update_my_profile(data jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() then raise exception '로그인 또는 정지 상태를 확인해 주세요.'; end if;
 update profiles set nickname=btrim(data->>'nickname'),avatar_url=nullif(data->>'avatar_url',''),
 grade=nullif(data->>'grade','')::smallint,class_number=nullif(data->>'class_number','')::smallint,
 cohort=nullif(data->>'cohort','')::smallint where id=auth.uid();
end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare n text; begin
 n=btrim(coalesce(new.raw_user_meta_data->>'nickname',''));
 if length(n) not between 2 and 20 then n='user-'||left(md5(new.id::text),15); end if;
 begin insert into profiles(id,nickname) values(new.id,n);
 exception when unique_violation then insert into profiles(id,nickname) values(new.id,'user-'||left(md5(new.id::text),15)) on conflict(id) do nothing; end;
 return new;
end $$;

create or replace function public.save_document(data jsonb, target_id uuid default null, expected_revision integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare d public.documents; typ public.document_type; tag text; tid uuid; rel uuid; snap jsonb; begin
 if not public.is_active_user() then raise exception '로그인 또는 정지 상태를 확인해 주세요.'; end if;
 if length(btrim(coalesce(data->>'content','')))=0 then raise exception '본문을 입력해 주세요.'; end if;
 if target_id is not null then
   select * into d from documents where id=target_id for update;
   if not found or not public.can_edit_document(target_id) then raise exception '문서 수정 권한이 없거나 잠겨 있습니다.'; end if;
   if expected_revision is distinct from d.revision then raise exception '다른 사용자가 수정했습니다. 새로고침 후 다시 편집해 주세요.'; end if;
   if length(btrim(coalesce(data->>'edit_summary','')))=0 then raise exception '수정 이유를 입력해 주세요.'; end if;
 end if;
 typ=coalesce(nullif(data->>'document_type',''),'other')::public.document_type;
 -- 인물 문서를 다른 유형으로 변경해 동의 절차를 우회할 수 없습니다.
 if target_id is not null and d.document_type in ('student','teacher') and typ not in ('student','teacher') and not public.is_admin() then
   raise exception '인물 문서의 종류 변경은 관리자에게 요청해 주세요.';
 end if;
 if nullif(data->>'category_id','') is not null and exists(select 1 from categories where id=(data->>'category_id')::uuid and slug in ('student','teacher')) and typ not in ('student','teacher') then
   raise exception '학생·선생님 카테고리는 인물 문서로 작성해 주세요.';
 end if;
 if target_id is null then
   insert into documents(title,slug,summary,content,document_type,category_id,thumbnail_url,author_id,status,edit_summary,revision)
   values(btrim(data->>'title'),'doc-'||gen_random_uuid(),data->>'summary',data->>'content',typ,
    nullif(data->>'category_id','')::uuid,nullif(data->>'thumbnail_url',''),auth.uid(),'published','문서 생성',1) returning * into d;
 else
   update documents set title=btrim(data->>'title'),summary=data->>'summary',content=data->>'content',document_type=typ,
   category_id=nullif(data->>'category_id','')::uuid,thumbnail_url=nullif(data->>'thumbnail_url',''),
   edit_summary=data->>'edit_summary',updated_at=now(),revision=revision+1 where id=target_id returning * into d;
 end if;
 delete from document_tags where document_id=d.id;
 if jsonb_array_length(coalesce(data->'tags','[]'))>20 then raise exception '태그는 20개까지 가능합니다.'; end if;
 for tag in select distinct btrim(value) from jsonb_array_elements_text(coalesce(data->'tags','[]')) loop
   if tag='' then continue; end if;
   insert into tags(name) values(tag) on conflict(name) do update set name=excluded.name returning id into tid;
   insert into document_tags values(d.id,tid);
 end loop;
 delete from document_links where document_id=d.id;
 for rel in select distinct value::uuid from jsonb_array_elements_text(coalesce(data->'related_ids','[]')) loop
   if not public.can_read_document(rel) then raise exception '관련 문서에 접근할 수 없습니다.'; end if;
   insert into document_links values(d.id,rel);
 end loop;
 snap=jsonb_build_object('title',d.title,'content',d.content,'summary',d.summary,'document_type',d.document_type,
   'category_id',d.category_id,'thumbnail_url',d.thumbnail_url,'tags',coalesce(data->'tags','[]'),'related_ids',coalesce(data->'related_ids','[]'));
 insert into document_revisions(document_id,editor_id,title,content,edit_summary,revision_number,snapshot)
 values(d.id,auth.uid(),d.title,d.content,d.edit_summary,d.revision,snap);
 insert into activity_log(actor_id,action,target_id) values(auth.uid(),case when target_id is null then '문서 생성' else '문서 수정' end,d.id);
 return d.id;
end $$;

create or replace function public.restore_revision(revision_id uuid, expected_revision integer) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.document_revisions; payload jsonb; begin
 select * into r from document_revisions where id=revision_id;
 if not found or not public.can_edit_document(r.document_id) or (r.is_hidden and not public.is_admin()) then raise exception '복구 권한이 없습니다.'; end if;
 payload=coalesce(r.snapshot,(select jsonb_build_object('title',r.title,'content',r.content,'summary',d.summary,'document_type',d.document_type,'category_id',d.category_id,'thumbnail_url',d.thumbnail_url,'tags','[]'::jsonb,'related_ids','[]'::jsonb) from documents d where d.id=r.document_id));
 -- 삭제된 카테고리/관련 문서는 복구에서 제외합니다.
 if not exists(select 1 from categories where id=nullif(payload->>'category_id','')::uuid) then payload=payload||'{"category_id":null}'; end if;
 payload=payload||jsonb_build_object('related_ids',coalesce((select jsonb_agg(value) from jsonb_array_elements_text(coalesce(payload->'related_ids','[]')) where public.can_read_document(value::uuid)),'[]'::jsonb));
 return public.save_document(payload||jsonb_build_object('edit_summary','r'||r.revision_number||' 버전 복구'),r.document_id,expected_revision);
end $$;

create or replace function public.set_person_consent(target_id uuid, allowed boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() or not exists(select 1 from documents where id=target_id and subject_id=auth.uid() and subject_verified) then raise exception '관리자가 확인한 문서 당사자만 동의할 수 있습니다.'; end if;
 update documents set subject_consent=allowed where id=target_id;
 insert into activity_log(actor_id,action,target_id) values(auth.uid(),case when allowed then '공개 동의' else '공개 동의 철회' end,target_id);
end $$;
create or replace function public.increment_document_view(target_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 update documents set views=views+1 where id=target_id and status='published' and public.can_read_document(id);
end $$;

create or replace function public.write_comment(target_document uuid, body text, parent uuid default null, comment_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.comments; result uuid; begin
 if not public.is_active_user() or not public.can_read_document(target_document) then raise exception '댓글 작성 권한이 없습니다.'; end if;
 perform 1 from documents where id=target_document and not comments_locked for share;
 if not found then raise exception '댓글 작성이 잠겨 있습니다.'; end if;
 if length(btrim(body)) not between 1 and 500 then raise exception '댓글은 1~500자로 입력해 주세요.'; end if;
 if comment_id is not null then
   select * into c from comments where id=comment_id for update;
   if not found or c.document_id<>target_document or c.author_id is distinct from auth.uid() or c.is_deleted or c.is_hidden then raise exception '댓글 수정 권한이 없습니다.'; end if;
   update comments set content=btrim(body) where id=comment_id;
   return comment_id;
 end if;
 if parent is not null and not exists(select 1 from comments where id=parent and document_id=target_document and parent_id is null and not is_hidden and not is_deleted) then raise exception '답글은 같은 문서의 댓글에 한 단계만 작성할 수 있습니다.'; end if;
 insert into comments(document_id,author_id,parent_id,content) values(target_document,auth.uid(),parent,btrim(body)) returning id into result;
 insert into activity_log(actor_id,action,target_id) values(auth.uid(),'댓글 작성',result);
 return result;
end $$;
create or replace function public.delete_comment(target_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() or not exists(select 1 from comments where id=target_id and (author_id=auth.uid() or public.is_admin())) then raise exception '삭제 권한이 없습니다.'; end if;
 update comments set content='삭제된 댓글입니다.',is_deleted=true where id=target_id;
 delete from comment_likes where comment_id=target_id;
end $$;
create or replace function public.toggle_like(target_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() or not exists(select 1 from comments where id=target_id and not is_hidden and not is_deleted and public.can_read_document(document_id)) then raise exception '좋아요 권한이 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||target_id::text));
 delete from comment_likes where comment_id=target_id and user_id=auth.uid();
 if not found then insert into comment_likes(comment_id,user_id) values(target_id,auth.uid()); end if;
end $$;
create or replace function public.pin_comment(target_id uuid, pinned boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() or not exists(select 1 from comments c join documents d on d.id=c.document_id where c.id=target_id and (public.is_admin() or (d.subject_id=auth.uid() and d.subject_verified and c.author_id=auth.uid()))) then raise exception '고정 권한이 없습니다.'; end if;
 update comments set is_pinned=pinned where id=target_id;
end $$;
create or replace function public.request_deletion(target_id uuid, reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_active_user() or not public.can_read_document(target_id) then raise exception '삭제 요청 권한이 없습니다.'; end if;
 insert into deletion_requests(document_id,requester_id,reason) values(target_id,auth.uid(),btrim(reason));
end $$;

create or replace function public.admin_action(kind text, target_id uuid, data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 if kind='member' then
   perform pg_advisory_xact_lock(482019);
   if target_id=auth.uid() and ((data->>'role')='user' or (data->>'is_suspended')::boolean) then raise exception '자신의 관리자 권한 또는 정지 상태는 변경할 수 없습니다.'; end if;
   update profiles set role=coalesce((data->>'role')::public.user_role,role),
     is_suspended=coalesce((data->>'is_suspended')::boolean,is_suspended),
     suspended_until=case when data ? 'suspended_until' then nullif(data->>'suspended_until','')::timestamptz else suspended_until end where id=target_id;
 elsif kind='document' then
   update documents set status=coalesce((data->>'status')::public.document_status,status),
    is_locked=coalesce((data->>'is_locked')::boolean,is_locked),
    comments_locked=coalesce((data->>'comments_locked')::boolean,comments_locked),
    is_featured=coalesce((data->>'is_featured')::boolean,is_featured) where id=target_id;
 elsif kind='verify_subject' then
   update documents set subject_id=nullif(data->>'subject_id','')::uuid,
   subject_verified=nullif(data->>'subject_id','') is not null,subject_consent=false where id=target_id and document_type in ('student','teacher');
 elsif kind='delete_document' then delete from documents where id=target_id;
 elsif kind='comment' then update comments set is_hidden=(data->>'is_hidden')::boolean where id=target_id;
 elsif kind='hide_member_comments' then update comments set is_hidden=true where author_id=target_id;
 elsif kind='revision' then update document_revisions set is_hidden=(data->>'is_hidden')::boolean where id=target_id;
 elsif kind='category' then
   if target_id is null then insert into categories(name,slug,sort_order) values(btrim(data->>'name'),data->>'slug',(data->>'sort_order')::int);
   else update categories set name=btrim(data->>'name'),slug=data->>'slug',sort_order=(data->>'sort_order')::int where id=target_id; end if;
 elsif kind='delete_category' then delete from categories where id=target_id;
 elsif kind='resolve_request' then update deletion_requests set resolved=true where id=target_id;
 else raise exception '지원하지 않는 작업입니다.'; end if;
 insert into activity_log(actor_id,action,target_id) values(auth.uid(),kind,target_id);
end $$;

-- 함수 실행 권한도 명시적으로 제한합니다.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('update_my_profile','save_document','restore_revision','set_person_consent',
 'write_comment','delete_comment','toggle_like','pin_comment','request_deletion','admin_action')
 loop execute format('revoke all on function %s from public, anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature); end loop;
end $$;

-- 비공개 이미지 저장소. 작성자 또는 문서 열람 권한이 있는 사용자만 서명 URL 발급 가능.
do $$ begin
 if to_regclass('storage.buckets') is not null then
   insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('wiki-images','wiki-images',false,5242880,array['image/png','image/jpeg','image/webp'])
   on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
   execute 'drop policy if exists wiki_image_upload on storage.objects';
   execute 'create policy wiki_image_upload on storage.objects for insert to authenticated with check
     (bucket_id = ''wiki-images'' and split_part(name,''/'',1)=auth.uid()::text and public.is_active_user())';
   execute 'drop policy if exists wiki_image_read on storage.objects';
   execute 'create policy wiki_image_read on storage.objects for select using
     (bucket_id = ''wiki-images'' and (split_part(name,''/'',1)=auth.uid()::text or public.is_admin()
      or exists(select 1 from public.documents d where d.thumbnail_url = ''asset:''||name and public.can_read_document(d.id))
      or exists(select 1 from public.author_labels() p where p.avatar_url = ''asset:''||name)))';
 end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,nickname)
select id,'user-'||left(md5(id::text),15) from auth.users on conflict do nothing;
notify pgrst, 'reload schema';
commit;
