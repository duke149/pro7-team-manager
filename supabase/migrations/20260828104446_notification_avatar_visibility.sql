update public.notifications as notification
set target_path = '/teams/' || team.slug || '/matches/' || notification.source_id::text
from public.teams as team
where team.id = notification.team_id
  and notification.target_path is distinct from
    '/teams/' || team.slug || '/matches/' || notification.source_id::text;

create or replace function private.sync_notification_team_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.slug is distinct from old.slug then
    update public.notifications
    set target_path = '/teams/' || new.slug || '/matches/' || source_id::text
    where team_id = new.id;
  end if;
  return new;
end;
$function$;

alter function private.sync_notification_team_slug() owner to postgres;
revoke execute on function private.sync_notification_team_slug()
from public, anon, authenticated, service_role;

drop trigger if exists trg_teams_sync_notification_slug on public.teams;
create trigger trg_teams_sync_notification_slug
after update of slug on public.teams
for each row execute function private.sync_notification_team_slug();

drop policy if exists player_avatars_select_team_visible on storage.objects;
create policy player_avatars_select_team_visible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-avatars'
  and case
    when (storage.foldername(name))[1]
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then private.can_view_profile(((storage.foldername(name))[1])::uuid)
    else false
  end
);
