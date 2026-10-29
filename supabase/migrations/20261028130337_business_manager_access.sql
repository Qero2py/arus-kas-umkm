-- Owners remain in businesses.owner_id. Membership rows represent authorized managers.
create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  member_email text not null,
  role text not null default 'manager' check (role = 'manager'),
  joined_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_business_idx on public.business_members (business_id);

-- The helper reads only ownership. It avoids recursive policies when owners list managers.
create function private.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses
    where id = p_business_id and owner_id = (select auth.uid())
  );
$$;
revoke all on function private.is_business_owner(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_business_owner(uuid) to authenticated;

alter table public.business_members enable row level security;
revoke all on public.business_members from anon, authenticated;
grant select, delete on public.business_members to authenticated;

create policy "Member or owner reads manager membership" on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_business_owner(business_id));
create policy "Owner removes manager" on public.business_members
  for delete to authenticated
  using (private.is_business_owner(business_id));

create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index business_invites_business_idx on public.business_invites (business_id, created_at desc);
alter table public.business_invites enable row level security;
revoke all on public.business_invites from anon, authenticated;
grant select on public.business_invites to authenticated;
grant insert (business_id, code_hash, expires_at) on public.business_invites to authenticated;
grant update (revoked_at) on public.business_invites to authenticated;

create policy "Owner reads invitations" on public.business_invites
  for select to authenticated using (private.is_business_owner(business_id));
create policy "Owner creates invitation" on public.business_invites
  for insert to authenticated with check (private.is_business_owner(business_id));
create policy "Owner revokes invitation" on public.business_invites
  for update to authenticated
  using (private.is_business_owner(business_id) and used_at is null)
  with check (private.is_business_owner(business_id) and revoked_at is not null and used_at is null);

-- The secret is supplied only to the Server Action; clients store a SHA-256 hash.
-- This is the only privileged path for joining a business and it checks auth.uid().
create function public.redeem_business_invite(p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_email text;
begin
  if v_user_id is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if exists (select 1 from public.businesses where owner_id = v_user_id)
    or exists (select 1 from public.business_members where user_id = v_user_id) then
    return null;
  end if;
  select business_id into v_business_id
    from public.business_invites
    where code_hash = p_code_hash and used_at is null and revoked_at is null and expires_at > now()
    for update;
  if v_business_id is null then return null; end if;

  select email into v_email from auth.users where id = v_user_id;
  if v_email is null then return null; end if;
  insert into public.business_members (business_id, user_id, member_email)
    values (v_business_id, v_user_id, v_email);
  update public.business_invites
    set used_at = now(), used_by = v_user_id
    where code_hash = p_code_hash;
  return v_business_id;
end;
$$;
revoke all on function public.redeem_business_invite(text) from public, anon;
grant execute on function public.redeem_business_invite(text) to authenticated;

-- A manager belongs to one business and cannot create a second business directly.
drop policy "Owner creates business" on public.businesses;
create policy "Owner creates business" on public.businesses
  for insert to authenticated
  with check (owner_id = (select auth.uid())
    and not exists (select 1 from public.business_members m where m.user_id = (select auth.uid())));

create policy "Manager reads business" on public.businesses
  for select to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = id and m.user_id = (select auth.uid())));

create policy "Manager reads obligations" on public.obligations
  for select to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())));
create policy "Manager creates obligations" on public.obligations
  for insert to authenticated
  with check (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())));

create policy "Manager reads transactions" on public.transactions
  for select to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())));
create policy "Manager creates transactions" on public.transactions
  for insert to authenticated
  with check (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())));
create policy "Manager corrects transactions" on public.transactions
  for update to authenticated
  using (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.business_members m
    where m.business_id = business_id and m.user_id = (select auth.uid())));
