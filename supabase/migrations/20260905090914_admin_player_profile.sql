-- Shared profiles: an authorized manager may edit an active teammate.
-- Existing column grants still prevent auth flags / identity reassignment.
create function private.managed_profile_team(p_user_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.team_id from public.memberships m
  where m.user_id = p_user_id and m.status = 'active'
    and private.has_team_permission(m.team_id, 'players.manage')
    and private.has_team_permission(m.team_id, 'members.manage')
  order by m.team_id limit 1
$$;
revoke all on function private.managed_profile_team(uuid) from public, anon;
grant execute on function private.managed_profile_team(uuid) to authenticated;

create policy profiles_update_team_manager on public.profiles for update to authenticated
using (private.managed_profile_team(id) is not null)
with check (private.managed_profile_team(id) is not null);

create function private.can_manage_avatar(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_path !~ '^[0-9a-fA-F-]{36}/avatar\.(jpg|png|webp)$' then return false; end if;
  return private.managed_profile_team(pg_catalog.split_part(p_path, '/', 1)::uuid) is not null;
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.can_manage_avatar(text) from public, anon;
grant execute on function private.can_manage_avatar(text) to authenticated;
create policy avatar_manager_select on storage.objects for select to authenticated
using (bucket_id = 'player-avatars' and private.can_manage_avatar(name));
create policy avatar_manager_insert on storage.objects for insert to authenticated
with check (bucket_id = 'player-avatars' and private.can_manage_avatar(name));
create policy avatar_manager_update on storage.objects for update to authenticated
using (bucket_id = 'player-avatars' and private.can_manage_avatar(name))
with check (bucket_id = 'player-avatars' and private.can_manage_avatar(name));
create policy avatar_manager_delete on storage.objects for delete to authenticated
using (bucket_id = 'player-avatars' and private.can_manage_avatar(name));

create function private.audit_managed_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  if auth.uid() is not null and auth.uid() <> new.id and old is distinct from new then
    v_team := private.managed_profile_team(new.id);
    if v_team is not null then
      insert into private.audit_events(actor_user_id,team_id,table_name,action,row_key,old_data,new_data)
      values(auth.uid(),v_team,'profiles','UPDATE',pg_catalog.jsonb_build_object('id',new.id),
        pg_catalog.jsonb_build_object('display_name',old.display_name,'avatar_path',old.avatar_path,'height_cm',old.height_cm,'weight_kg',old.weight_kg,'preferred_positions',old.preferred_positions),
        pg_catalog.jsonb_build_object('display_name',new.display_name,'avatar_path',new.avatar_path,'height_cm',new.height_cm,'weight_kg',new.weight_kg,'preferred_positions',new.preferred_positions));
    end if;
  end if;
  return new;
end $$;
revoke all on function private.audit_managed_profile() from public, anon, authenticated;
create trigger audit_managed_profile after update on public.profiles
for each row execute function private.audit_managed_profile();
