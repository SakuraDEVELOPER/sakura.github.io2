create extension if not exists pgcrypto;

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create sequence if not exists public.profile_id_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  cache 1;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  firebase_uid text unique,
  profile_id bigint not null unique default nextval('public.profile_id_seq'),
  email text,
  email_verified boolean not null default false,
  verification_required boolean not null default false,
  verification_email_sent boolean not null default false,
  login text,
  login_lower text generated always as (
    case
      when login is null then null
      else lower(login)
    end
  ) stored,
  display_name text,
  photo_url text,
  avatar_path text,
  avatar_type text,
  avatar_size bigint,
  roles text[] not null default array['user']::text[],
  is_banned boolean not null default false,
  banned_at timestamptz,
  provider_ids text[] not null default array[]::text[],
  login_history jsonb not null default '[]'::jsonb,
  visit_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_sign_in_at timestamptz
);

create unique index if not exists profiles_login_lower_unique_idx
  on public.profiles (login_lower)
  where login_lower is not null;

create index if not exists profiles_roles_gin_idx
  on public.profiles
  using gin (roles);

create index if not exists profiles_display_name_idx
  on public.profiles (display_name);

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create table if not exists public.profile_presence (
  profile_id bigint primary key references public.profiles(profile_id) on delete cascade,
  auth_user_id uuid,
  firebase_uid text,
  status text not null default 'offline' check (status in ('online', 'offline')),
  is_online boolean not null default false,
  current_path text,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profile_presence_is_online_idx
  on public.profile_presence (is_online, last_seen_at desc);

create index if not exists profile_presence_auth_user_id_idx
  on public.profile_presence (auth_user_id);

create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  profile_id bigint not null references public.profiles(profile_id) on delete cascade,
  author_profile_id bigint references public.profiles(profile_id) on delete set null,
  auth_user_id uuid,
  firebase_author_uid text,
  author_name text not null,
  author_photo_url text,
  author_accent_role text,
  message text not null default '',
  media_url text,
  media_type text,
  media_path text,
  media_size bigint,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_comments_message_length_chk check (char_length(message) <= 280),
  constraint profile_comments_content_required_chk check (
    nullif(trim(message), '') is not null
    or media_url is not null
  )
);

create index if not exists profile_comments_profile_created_idx
  on public.profile_comments (profile_id, created_at desc);

create index if not exists profile_comments_author_profile_idx
  on public.profile_comments (author_profile_id, created_at desc);

create index if not exists profile_comments_auth_user_idx
  on public.profile_comments (auth_user_id, created_at desc);

create index if not exists profile_comments_firebase_author_uid_idx
  on public.profile_comments (firebase_author_uid, created_at desc);

create index if not exists profile_comments_media_path_idx
  on public.profile_comments (media_path)
  where media_path is not null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_row_updated_at();

drop trigger if exists profile_presence_set_updated_at on public.profile_presence;
create trigger profile_presence_set_updated_at
before update on public.profile_presence
for each row
execute function public.set_row_updated_at();

drop trigger if exists profile_comments_set_updated_at on public.profile_comments;
create trigger profile_comments_set_updated_at
before update on public.profile_comments
for each row
execute function public.set_row_updated_at();
