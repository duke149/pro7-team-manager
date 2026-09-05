-- Preserve the existing transaction, authorization and audit boundaries.
-- Only localize the fallback description for newly recorded payments.
create or replace function public.manage_member_due(
  p_action text,
  p_team_id uuid,
  p_due_id uuid,
  p_user_id uuid,
  p_period_start date,
  p_amount_vnd bigint,
  p_due_date date,
  p_note text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_due public.member_dues%rowtype;
  v_entry public.finance_entries%rowtype;
  v_due_id uuid;
  v_entry_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_team_permission(p_team_id, 'finance.manage') then
    raise exception using errcode = '42501', message = 'Finance management permission required';
  end if;
  if p_action not in ('create', 'pay', 'waive', 'void_payment') then
    raise exception using errcode = '22023', message = 'Invalid member due action';
  end if;

  if p_action = 'create' then
    if p_due_id is not null or p_user_id is null or p_period_start is null
      or p_period_start <> date_trunc('month', p_period_start)::date
      or p_amount_vnd is null or p_amount_vnd <= 0
      or p_due_date is null or p_due_date < p_period_start
      or p_expected_updated_at is not null then
      raise exception using errcode = '22023', message = 'Invalid member due';
    end if;
    if not exists (
      select 1 from public.memberships as membership
      where membership.team_id = p_team_id
        and membership.user_id = p_user_id
        and membership.status = 'active'
    ) then
      raise exception using errcode = '23503', message = 'Due member is not active';
    end if;

    insert into public.member_dues (
      team_id, user_id, period_start, amount_vnd, due_date, created_by_user_id
    ) values (
      p_team_id, p_user_id, p_period_start, p_amount_vnd, p_due_date, v_actor_user_id
    ) returning id into v_due_id;
  else
    select due.* into v_due
    from public.member_dues as due
    where due.id = p_due_id and due.team_id = p_team_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Member due not found';
    end if;
    if p_expected_updated_at is distinct from v_due.updated_at then
      raise exception using errcode = '40001', message = 'Member due changed; refresh and retry';
    end if;

    if p_action in ('pay', 'waive') and v_due.status <> 'pending' then
      raise exception using errcode = '55000', message = 'Only pending dues can be paid or waived';
    end if;
    if p_action = 'void_payment' and (
      v_due.status <> 'paid' or v_due.finance_entry_id is null
    ) then
      raise exception using errcode = '55000', message = 'Only paid dues can have their payment voided';
    end if;

    if p_action = 'pay' then
      insert into public.finance_entries (
        team_id, direction, amount_vnd, category, occurred_on, description, created_by_user_id
      ) values (
        p_team_id,
        'income',
        v_due.amount_vnd,
        'member_due',
        current_date,
        coalesce(nullif(pg_catalog.btrim(p_note), ''), 'Đóng quỹ tháng ' || pg_catalog.to_char(v_due.period_start, 'MM/YYYY')),
        v_actor_user_id
      ) returning id into v_entry_id;

      update public.member_dues
      set status = 'paid', paid_at = pg_catalog.now(), finance_entry_id = v_entry_id
      where id = p_due_id and team_id = p_team_id;
    elsif p_action = 'waive' then
      update public.member_dues
      set status = 'waived'
      where id = p_due_id and team_id = p_team_id;
    else
      if p_note is null or p_note <> pg_catalog.btrim(p_note)
        or pg_catalog.char_length(p_note) not between 1 and 300 then
        raise exception using errcode = '22023', message = 'Payment void reason is required';
      end if;

      select entry.* into v_entry
      from public.finance_entries as entry
      where entry.id = v_due.finance_entry_id and entry.team_id = p_team_id
      for update;
      if not found or v_entry.voided_at is not null then
        raise exception using errcode = '55000', message = 'Due payment entry cannot be voided';
      end if;

      v_entry_id := v_due.finance_entry_id;
      update public.finance_entries
      set voided_at = pg_catalog.now(), voided_by_user_id = v_actor_user_id, void_reason = p_note
      where id = v_entry_id and team_id = p_team_id;

      update public.member_dues
      set status = 'pending', paid_at = null, finance_entry_id = null
      where id = p_due_id and team_id = p_team_id;

      insert into private.audit_events (
        actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
      ) values (
        v_actor_user_id, p_team_id, 'finance_entries', 'UPDATE',
        pg_catalog.jsonb_build_object('id', v_entry_id),
        pg_catalog.jsonb_build_object('voided', false, 'source', 'member_due'),
        pg_catalog.jsonb_build_object('voided', true, 'source', 'member_due', 'void_reason', p_note),
        null
      );
    end if;
    v_due_id := p_due_id;
  end if;

  insert into private.audit_events (
    actor_user_id, team_id, table_name, action, row_key, old_data, new_data, request_id
  ) values (
    v_actor_user_id, p_team_id, 'member_dues',
    case when p_action = 'create' then 'INSERT' else 'UPDATE' end,
    pg_catalog.jsonb_build_object('id', v_due_id), null,
    pg_catalog.jsonb_build_object('operation', p_action, 'finance_entry_id', v_entry_id), null
  );
  return v_due_id;
end;
$function$;
