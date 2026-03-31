create or replace function public.normalize_auth_provider_ids(app_metadata jsonb)
returns text[]
language sql
immutable
as $$
  with raw_values as (
    select nullif(trim(provider), '') as provider
    from (
      select jsonb_array_elements_text(
        case
          when jsonb_typeof(coalesce(app_metadata->'providers', '[]'::jsonb)) = 'array'
            then coalesce(app_metadata->'providers', '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as provider
      union all
      select app_metadata->>'provider'
    ) providers
  )
  select coalesce(
    array_agg(
      distinct case
        when provider = 'google' then 'google.com'
        when provider = 'email' then 'password'
        else provider
      end
    ),
    array[]::text[]
  )
  from raw_values
  where provider is not null;
$$;

create or replace function public.sanitize_profile_login_seed(seed text)
returns text
language sql
immutable
as $$
  select left(
    regexp_replace(coalesce(seed, ''), '[^[:alnum:]._-]+', '', 'g'),
    24
  );
$$;

create or replace function public.allocate_profile_login(
  seed text,
  exclude_auth_user_id uuid default null
)
returns text
language plpgsql
as $$
declare
  base_login text := public.sanitize_profile_login_seed(seed);
  candidate text;
  suffix_value integer := 0;
begin
  if base_login is null or length(base_login) < 3 then
    return null;
  end if;

  candidate := base_login;

  loop
    exit when not exists (
      select 1
      from public.profiles
      where login is not null
        and lower(login) = lower(candidate)
        and (
          exclude_auth_user_id is null
          or auth_user_id is distinct from exclude_auth_user_id
        )
    );

    suffix_value := suffix_value + 1;
    candidate := left(base_login, greatest(1, 24 - length(suffix_value::text))) || suffix_value::text;
  end loop;

  return candidate;
end;
$$;

create or replace function public.sync_profile_from_auth_user(
  target_auth_user_id uuid,
  target_email text,
  target_raw_user_meta_data jsonb,
  target_raw_app_meta_data jsonb,
  target_email_confirmed_at timestamptz,
  target_created_at timestamptz,
  target_updated_at timestamptz,
  target_last_sign_in_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_provider_ids text[] := public.normalize_auth_provider_ids(coalesce(target_raw_app_meta_data, '{}'::jsonb));
  v_email_verified boolean := (
    target_email_confirmed_at is not null
    or coalesce('google.com' = any(v_provider_ids), false)
  );
  v_verification_required boolean := not v_email_verified;
  v_resolved_display_name text := left(
    coalesce(
      nullif(trim(target_raw_user_meta_data->>'display_name'), ''),
      nullif(trim(target_raw_user_meta_data->>'full_name'), ''),
      nullif(trim(target_raw_user_meta_data->>'name'), ''),
      nullif(split_part(coalesce(target_email, ''), '@', 1), ''),
      'Sakura User'
    ),
    96
  );
  v_resolved_photo_url text := left(
    coalesce(
      nullif(trim(target_raw_user_meta_data->>'avatar_url'), ''),
      nullif(trim(target_raw_user_meta_data->>'picture'), '')
    ),
    2048
  );
  v_requested_login_seed text := coalesce(
    nullif(trim(target_raw_user_meta_data->>'login'), ''),
    nullif(trim(target_raw_user_meta_data->>'requested_login'), ''),
    nullif(trim(target_raw_user_meta_data->>'display_name'), ''),
    nullif(trim(target_raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(target_email, ''), '@', 1), '')
  );
  v_resolved_login text := public.allocate_profile_login(v_requested_login_seed, target_auth_user_id);
  existing_profile_id bigint;
begin
  select profile_id
  into existing_profile_id
  from public.profiles
  where auth_user_id = target_auth_user_id
     or (
       auth_user_id is null
       and email is not distinct from target_email
     )
  order by
    case when auth_user_id = target_auth_user_id then 0 else 1 end,
    profile_id asc
  limit 1;

  if existing_profile_id is not null then
    update public.profiles as p
    set
      auth_user_id = target_auth_user_id,
      email = coalesce(target_email, p.email),
      email_verified = v_email_verified,
      verification_required = v_verification_required,
      verification_email_sent = false,
      provider_ids = case
        when coalesce(array_length(v_provider_ids, 1), 0) > 0 then v_provider_ids
        else coalesce(p.provider_ids, array[]::text[])
      end,
      display_name = coalesce(p.display_name, v_resolved_display_name),
      photo_url = coalesce(p.photo_url, v_resolved_photo_url),
      login = coalesce(p.login, v_resolved_login),
      created_at = coalesce(p.created_at, target_created_at, timezone('utc', now())),
      updated_at = coalesce(target_updated_at, timezone('utc', now())),
      last_sign_in_at = coalesce(target_last_sign_in_at, p.last_sign_in_at)
    where p.profile_id = existing_profile_id;

    return existing_profile_id;
  end if;

  perform pg_advisory_xact_lock(2026033104);
  perform setval(
    'public.profile_id_seq',
    greatest(
      coalesce((select max(profile_id) from public.profiles), 0) + 1,
      1
    ),
    false
  );

  insert into public.profiles (
    auth_user_id,
    email,
    email_verified,
    verification_required,
    verification_email_sent,
    login,
    display_name,
    photo_url,
    provider_ids,
    roles,
    created_at,
    updated_at,
    last_sign_in_at
  )
  values (
    target_auth_user_id,
    target_email,
    v_email_verified,
    v_verification_required,
    false,
    v_resolved_login,
    v_resolved_display_name,
    v_resolved_photo_url,
    case
      when coalesce(array_length(v_provider_ids, 1), 0) > 0 then v_provider_ids
      else array['password']::text[]
    end,
    array['user']::text[],
    coalesce(target_created_at, timezone('utc', now())),
    coalesce(target_updated_at, timezone('utc', now())),
    target_last_sign_in_at
  )
  returning profile_id into existing_profile_id;

  return existing_profile_id;
end;
$$;

create or replace function public.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.sync_profile_from_auth_user(
    new.id,
    new.email,
    new.raw_user_meta_data,
    new.raw_app_meta_data,
    new.email_confirmed_at,
    new.created_at,
    new.updated_at,
    new.last_sign_in_at
  );

  return new;
end;
$$;

drop trigger if exists auth_users_sync_profile on auth.users;
create trigger auth_users_sync_profile
after insert or update of email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, updated_at, last_sign_in_at
on auth.users
for each row
execute function public.handle_auth_user_profile_sync();

select setval(
  'public.profile_id_seq',
  greatest(
    coalesce((select max(profile_id) from public.profiles), 0) + 1,
    1
  ),
  false
);

do $$
declare
  auth_user_row record;
begin
  for auth_user_row in
    select
      id,
      email,
      raw_user_meta_data,
      raw_app_meta_data,
      email_confirmed_at,
      created_at,
      updated_at,
      last_sign_in_at
    from auth.users
  loop
    perform public.sync_profile_from_auth_user(
      auth_user_row.id,
      auth_user_row.email,
      auth_user_row.raw_user_meta_data,
      auth_user_row.raw_app_meta_data,
      auth_user_row.email_confirmed_at,
      auth_user_row.created_at,
      auth_user_row.updated_at,
      auth_user_row.last_sign_in_at
    );
  end loop;
end
$$;
