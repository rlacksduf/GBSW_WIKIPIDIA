-- 경소위키 첫 버전 스키마. Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create type public.user_role as enum ('user', 'admin');
create type public.document_status as enum ('draft', 'published', 'hidden');
create type public.document_type as enum ('student', 'teacher', 'club', 'project', 'event', 'place', 'term', 'other');

create table public.profiles (
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

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0
);

insert into public.categories (name, slug, sort_order) values
  ('학생', 'student', 10), ('선생님', 'teacher', 20), ('동아리', 'club', 30),
  ('프로젝트', 'project', 40), ('교내 행사', 'event', 50), ('학교 장소', 'place', 60),
  ('학교 용어', 'term', 70), ('기타', 'other', 80);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
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

create table public.document_revisions (
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

create table public.tags (id uuid primary key default gen_random_uuid(), name text not null unique check (char_length(name) between 1 and 30));
create table public.document_tags (
  document_id uuid references public.documents(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.comment_likes (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index documents_search_idx on public.documents using gin (to_tsvector('simple', title || ' ' || coalesce(summary, '') || ' ' || content));
create index comments_document_idx on public.comments(document_id, created_at);
create index revisions_document_idx on public.document_revisions(document_id, revision_number desc);

-- 보안 확인용 함수. security definer로 profiles RLS 재귀를 피합니다.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not is_suspended and (suspended_until is null or suspended_until < now()))
$$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname) values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), 'user-' || left(new.id::text, 8)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger documents_updated before update on public.documents for each row execute procedure public.set_updated_at();
create trigger comments_updated before update on public.comments for each row execute procedure public.set_updated_at();

-- 모든 문서 생성·수정은 자동으로 버전 보관합니다.
create or replace function public.save_document_revision() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_revisions (document_id, editor_id, title, content, edit_summary, revision_number)
  values (new.id, auth.uid(), new.title, new.content, new.edit_summary,
    coalesce((select max(revision_number) + 1 from public.document_revisions where document_id = new.id), 1));
  return new;
end; $$;
create trigger document_revision_after_write after insert or update of title, content on public.documents for each row execute procedure public.save_document_revision();

create or replace function public.increment_document_view(target_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin update public.documents set views = views + 1 where id = target_id and status = 'published'; end; $$;

-- 답글은 정확히 한 단계까지만 허용합니다.
create or replace function public.limit_comment_depth() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null and exists (select 1 from public.comments where id = new.parent_id and parent_id is not null) then
    raise exception 'Replies can only be one level deep';
  end if;
  return new;
end; $$;
create trigger comments_limit_depth before insert on public.comments for each row execute procedure public.limit_comment_depth();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_revisions enable row level security;
alter table public.tags enable row level security;
alter table public.document_tags enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

create policy "profiles readable to members" on public.profiles for select to authenticated using (true);
create policy "profile self update" on public.profiles for update to authenticated using (id = auth.uid() and role = 'user') with check (id = auth.uid() and role = 'user');
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "categories public read" on public.categories for select using (true);
create policy "admin manages categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "only public documents are readable" on public.documents for select using (
  (status = 'published' and (document_type not in ('student','teacher') or subject_consent))
  or author_id = auth.uid() or public.is_admin()
);
create policy "active users create their documents" on public.documents for insert to authenticated with check (author_id = auth.uid() and public.is_active_user());
create policy "author edits unlocked document" on public.documents for update to authenticated using ((author_id = auth.uid() and not is_locked and public.is_active_user()) or public.is_admin()) with check ((author_id = auth.uid() and not is_locked and public.is_active_user()) or public.is_admin());
create policy "admin deletes documents" on public.documents for delete to authenticated using (public.is_admin());

create policy "visible revisions readable" on public.document_revisions for select using (exists (select 1 from public.documents d where d.id = document_id));
create policy "tags public read" on public.tags for select using (true);
create policy "admin manages tags" on public.tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "document tags public read" on public.document_tags for select using (true);
create policy "authors manage document tags" on public.document_tags for all to authenticated using (exists (select 1 from public.documents d where d.id = document_id and (d.author_id = auth.uid() or public.is_admin()))) with check (exists (select 1 from public.documents d where d.id = document_id and (d.author_id = auth.uid() or public.is_admin())));

create policy "visible comments readable" on public.comments for select using (not is_hidden or author_id = auth.uid() or public.is_admin());
create policy "active users write comments" on public.comments for insert to authenticated with check (author_id = auth.uid() and public.is_active_user());
create policy "authors update own comments" on public.comments for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check ((author_id = auth.uid() and not is_hidden) or public.is_admin());
create policy "authors or admins delete comments" on public.comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());
create policy "likes readable" on public.comment_likes for select using (true);
create policy "members manage own likes" on public.comment_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
