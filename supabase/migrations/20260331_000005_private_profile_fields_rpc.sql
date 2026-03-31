create or replace function public.get_private_profile_fields_rpc(target_profile_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_auth_user_id uuid := auth.uid();
  actor_profile record;
  target_profile record;
  actor_roles text[] := array[]::text[];
  target_roles text[] := array[]::text[];
  actor_is_root boolean := false;
  actor_is_co_owner boolean := false;
  target_is_root boolean := false;
begin
  if actor_auth_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_profile_id is null or target_profile_id <= 0 then
    raise exception 'Target profile id is required.';
  end if;

  select
    profile_id,
    roles
  into actor_profile
  from public.profiles
  where auth_user_id = actor_auth_user_id
  limit 1;

  if actor_profile.profile_id is null then
    raise exception 'Actor profile not found.';
  end if;

  select
    profile_id,
    email,
    email_verified,
    verification_required,
    provider_ids,
    roles
  into target_profile
  from public.profiles
  where profile_id = target_profile_id
  limit 1;

  if target_profile.profile_id is null then
    return null;
  end if;

  actor_roles := coalesce(actor_profile.roles, array[]::text[]);
  target_roles := coalesce(target_profile.roles, array[]::text[]);
  actor_is_root := coalesce('root' = any(actor_roles), false);
  actor_is_co_owner := coalesce('co-owner' = any(actor_roles), false);
  target_is_root := coalesce('root' = any(target_roles), false);

  if actor_profile.profile_id <> target_profile_id then
    if not actor_is_root and not actor_is_co_owner then
      raise exception 'Only the owner or a manager can read private profile fields.';
    end if;

    if actor_is_co_owner and not actor_is_root and target_is_root then
      raise exception 'Co-owner cannot manage a root account.';
    end if;
  end if;

  return jsonb_build_object(
    'email', target_profile.email,
    'emailVerified', target_profile.email_verified,
    'verificationRequired', target_profile.verification_required,
    'providerIds', coalesce(target_profile.provider_ids, array[]::text[])
  );
end;
$$;

grant execute on function public.get_private_profile_fields_rpc(bigint) to authenticated;
revoke all on function public.get_private_profile_fields_rpc(bigint) from anon;
