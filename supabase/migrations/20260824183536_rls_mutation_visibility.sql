-- PostgreSQL evaluates SELECT visibility before UPDATE RLS. Keep read-only
-- roles unchanged while allowing a narrowly scoped mutation permission to see
-- the rows that permission is already authorized to mutate.

drop policy if exists teams_select_authorized on public.teams;
create policy teams_select_authorized
on public.teams
for select
to authenticated
using (
  private.has_team_permission(id, 'team.read')
  or private.has_team_permission(id, 'team.update')
  or private.has_team_permission(id, 'team.delete')
);

drop policy if exists memberships_select_authorized on public.memberships;
create policy memberships_select_authorized
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.has_team_permission(team_id, 'members.read')
  or private.has_team_permission(team_id, 'members.manage')
);

drop policy if exists roles_select_authorized on public.roles;
create policy roles_select_authorized
on public.roles
for select
to authenticated
using (
  private.has_team_permission(team_id, 'roles.read')
  or private.has_team_permission(team_id, 'roles.manage')
);

drop policy if exists team_settings_select_authorized on public.team_settings;
create policy team_settings_select_authorized
on public.team_settings
for select
to authenticated
using (
  private.has_team_permission(team_id, 'settings.read')
  or private.has_team_permission(team_id, 'settings.update')
);
