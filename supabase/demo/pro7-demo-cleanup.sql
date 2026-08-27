begin;

delete from public.notifications as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000601'::uuid,
  '70000000-0000-4000-8000-000000000602'::uuid
])
  and row.body like 'PRO7-DEMO%';

delete from public.member_dues as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000501'::uuid,
  '70000000-0000-4000-8000-000000000502'::uuid,
  '70000000-0000-4000-8000-000000000503'::uuid
])
  and exists (
    select 1
    from private.audit_events as marker
    where marker.request_id = 'PRO7-DEMO-DUE-SNAPSHOT'
      and marker.table_name = 'member_dues'
      and marker.row_key = pg_catalog.jsonb_build_object('id', row.id)
      and marker.new_data = pg_catalog.to_jsonb(row)
  );

delete from private.audit_events as marker
where marker.request_id = 'PRO7-DEMO-DUE-SNAPSHOT'
  and marker.table_name = 'member_dues'
  and marker.row_key ->> 'id' = any (array[
    '70000000-0000-4000-8000-000000000501',
    '70000000-0000-4000-8000-000000000502',
    '70000000-0000-4000-8000-000000000503'
  ]);

delete from public.finance_entries as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000401'::uuid,
  '70000000-0000-4000-8000-000000000402'::uuid,
  '70000000-0000-4000-8000-000000000403'::uuid
])
  and row.description like 'PRO7-DEMO%'
  and row.category like 'PRO7-DEMO%';

delete from public.lineup_slots as row
using public.match_tactics as tactic
where row.tactic_id = tactic.id
  and row.team_id = tactic.team_id
  and row.id::text like '70000000-0000-4000-8000-000000001___'
  and tactic.id = any (array[
    '70000000-0000-4000-8000-000000000301'::uuid,
    '70000000-0000-4000-8000-000000000302'::uuid
  ])
  and tactic.instructions like 'PRO7-DEMO%';

delete from public.match_tactics as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000301'::uuid,
  '70000000-0000-4000-8000-000000000302'::uuid
])
  and row.instructions like 'PRO7-DEMO%';

delete from public.team_news as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000201'::uuid,
  '70000000-0000-4000-8000-000000000202'::uuid
])
  and row.body like 'PRO7-DEMO%';

delete from public.match_player_stats as row
using public.matches as match
where row.match_id = match.id
  and row.team_id = match.team_id
  and match.id = '70000000-0000-4000-8000-000000000002'
  and match.venue like 'PRO7-DEMO%';

delete from public.match_team_stats as row
using public.matches as match
where row.match_id = match.id
  and row.team_id = match.team_id
  and match.id = '70000000-0000-4000-8000-000000000002'
  and match.venue like 'PRO7-DEMO%';

delete from public.match_events as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000101'::uuid,
  '70000000-0000-4000-8000-000000000102'::uuid,
  '70000000-0000-4000-8000-000000000103'::uuid,
  '70000000-0000-4000-8000-000000000104'::uuid,
  '70000000-0000-4000-8000-000000000105'::uuid
])
  and row.note like 'PRO7-DEMO%';

delete from public.match_attendance as row
using public.matches as match
where row.match_id = match.id
  and row.team_id = match.team_id
  and match.id = any (array[
    '70000000-0000-4000-8000-000000000001'::uuid,
    '70000000-0000-4000-8000-000000000002'::uuid,
    '70000000-0000-4000-8000-000000000003'::uuid
  ])
  and match.venue like 'PRO7-DEMO%'
  and row.note like 'PRO7-DEMO%';

delete from public.matches as row
where row.id = any (array[
  '70000000-0000-4000-8000-000000000001'::uuid,
  '70000000-0000-4000-8000-000000000002'::uuid,
  '70000000-0000-4000-8000-000000000003'::uuid
])
  and row.venue like 'PRO7-DEMO%';

commit;
