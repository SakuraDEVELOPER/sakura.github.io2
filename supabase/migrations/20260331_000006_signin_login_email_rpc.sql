create or replace function public.resolve_signin_email_for_login(target_login text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_login text := lower(trim(coalesce(target_login, '')));
  resolved_email text;
begin
  if normalized_login = '' then
    return null;
  end if;

  select email
  into resolved_email
  from public.profiles
  where login is not null
    and lower(login) = normalized_login
    and email is not null
  order by profile_id asc
  limit 1;

  return resolved_email;
end;
$$;

grant execute on function public.resolve_signin_email_for_login(text) to anon, authenticated;
