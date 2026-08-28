alter table private.push_outbox enable row level security;
alter table private.push_deliveries enable row level security;

do $scheduler$
declare
  v_should_schedule boolean := false;
begin
  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is not null
    and pg_catalog.to_regclass('cron.job') is not null then
    execute 'select not exists (select 1 from cron.job where jobname = $1)'
      into v_should_schedule
      using 'pro7-web-push-minute';

    if v_should_schedule then
      execute 'select cron.schedule($1, $2, $3)'
        using
          'pro7-web-push-minute',
          '* * * * *',
          'select private.run_push_minute();';
    end if;
  end if;
end;
$scheduler$;
