alter table public.team_news
  drop constraint team_news_status_check,
  drop constraint team_news_publish_check;

alter table public.team_news
  add constraint team_news_status_check
    check (status in ('draft', 'published', 'archived')),
  add constraint team_news_publish_check check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
    or status = 'archived'
  );

create or replace function public.manage_team_news(
  p_team_id uuid,
  p_action text,
  p_news_id uuid,
  p_title text,
  p_body text,
  p_expected_updated_at timestamptz
)
returns table ( id uuid, title text, body text, status text, published_at timestamptz, updated_at timestamptz )
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_news public.team_news%rowtype;
  v_result public.team_news%rowtype;
  v_old_status text;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'news.manage') then
    raise exception using errcode = '42501', message = 'News management permission required';
  end if;
  if p_action not in ('create', 'update', 'publish', 'archive', 'restore') then
    raise exception using errcode = '22023', message = 'Invalid news action';
  end if;

  if p_action in ('create', 'update') then
    if p_title is null
      or p_title <> pg_catalog.btrim(p_title)
      or pg_catalog.char_length(p_title) not between 1 and 160
      or p_body is null
      or p_body <> pg_catalog.btrim(p_body)
      or pg_catalog.char_length(p_body) not between 1 and 5000 then
      raise exception using errcode = '22023', message = 'Invalid news content';
    end if;
  elsif p_title is not null or p_body is not null then
    raise exception using errcode = '22023', message = 'Unexpected news content';
  end if;

  if p_action = 'create' then
    if p_news_id is not null or p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'Invalid news create arguments';
    end if;
    insert into public.team_news (team_id, title, body, status, published_at, author_user_id)
    values (p_team_id, p_title, p_body, 'draft', null, v_actor_user_id)
    returning * into v_result;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'team_news', 'INSERT',
      pg_catalog.jsonb_build_object('id', v_result.id), null,
      pg_catalog.jsonb_build_object('status', v_result.status), null
    );
  else
    if p_news_id is null or p_expected_updated_at is null then
      raise exception using errcode = '22023', message = 'Invalid news mutation arguments';
    end if;

    select news.* into v_news
    from public.team_news as news
    where news.id = p_news_id
      and news.team_id = p_team_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Team news not found';
    end if;
    if p_expected_updated_at is distinct from v_news.updated_at then
      raise exception using errcode = '40001', message = 'Team news changed; refresh and retry';
    end if;
    v_old_status := v_news.status;

    case p_action
      when 'update' then
        if v_news.status = 'archived' then
          raise exception using errcode = '55000', message = 'Archived news cannot be edited';
        end if;
        update public.team_news as news
        set title = p_title, body = p_body
        where news.id = p_news_id and news.team_id = p_team_id
        returning news.* into v_result;
      when 'publish' then
        if v_news.status <> 'draft' then
          raise exception using errcode = '55000', message = 'Only draft news can be published';
        end if;
        update public.team_news as news
        set status = 'published', published_at = pg_catalog.clock_timestamp()
        where news.id = p_news_id and news.team_id = p_team_id
        returning news.* into v_result;
      when 'archive' then
        if v_news.status = 'archived' then
          raise exception using errcode = '55000', message = 'News is already archived';
        end if;
        update public.team_news as news
        set status = 'archived'
        where news.id = p_news_id and news.team_id = p_team_id
        returning news.* into v_result;
      when 'restore' then
        if v_news.status <> 'archived' then
          raise exception using errcode = '55000', message = 'Only archived news can be restored';
        end if;
        update public.team_news as news
        set status = 'draft', published_at = null
        where news.id = p_news_id and news.team_id = p_team_id
        returning news.* into v_result;
      else
        raise exception using errcode = '22023', message = 'Invalid news action';
    end case;

    insert into private.audit_events (
      actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
    ) values (
      v_actor_user_id, p_team_id, 'team_news', 'UPDATE',
      pg_catalog.jsonb_build_object('id', v_result.id),
      pg_catalog.jsonb_build_object('status', v_old_status),
      pg_catalog.jsonb_build_object('status', v_result.status, 'content_updated', p_action = 'update'), null
    );
  end if;

  return query select
    v_result.id,
    v_result.title,
    v_result.body,
    v_result.status,
    v_result.published_at,
    v_result.updated_at;
end;
$function$;

alter function public.manage_team_news(uuid, text, uuid, text, text, timestamptz) owner to postgres;
revoke execute on function public.manage_team_news(uuid, text, uuid, text, text, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.manage_team_news(uuid, text, uuid, text, text, timestamptz) to authenticated;
