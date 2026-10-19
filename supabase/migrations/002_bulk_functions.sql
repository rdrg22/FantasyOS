-- Escrituras masivas usadas por la sincronización (respetan los datos que la fuente no trae).

create or replace function public.fos_upsert_players(p_ws text, p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into players as p (id, ws, name, short_name, norm_name, team_id, position, status, status_note, start_prob, value,
    source_history, streak_days, acceleration, next_opponent_id, next_home, next_matchday, points_total, points_avg,
    points5, played5, matches_played, last_points, source, source_id, updated_at)
  select x.id, p_ws, x.name, x.short_name, x.norm_name, x.team_id, x.position, x.status, x.status_note, x.start_prob, x.value,
    x.source_history, x.streak_days, x.acceleration, x.next_opponent_id, x.next_home, x.next_matchday, x.points_total, x.points_avg,
    x.points5, x.played5, x.matches_played, x.last_points, x.source, x.source_id, coalesce(x.updated_at, now())
  from jsonb_to_recordset(p_rows) as x(id text, name text, short_name text, norm_name text, team_id text, position text,
    status text, status_note text, start_prob double precision, value bigint, source_history jsonb, streak_days integer,
    acceleration bigint, next_opponent_id text, next_home boolean, next_matchday integer, points_total integer,
    points_avg double precision, points5 integer, played5 integer, matches_played integer, last_points integer,
    source text, source_id text, updated_at timestamptz)
  on conflict (id) do update set
    name = excluded.name, short_name = coalesce(excluded.short_name, p.short_name), norm_name = excluded.norm_name,
    team_id = excluded.team_id, position = excluded.position,
    status = case when excluded.status = 'desconocido' then p.status else excluded.status end,
    status_note = case when excluded.status = 'desconocido' then p.status_note else excluded.status_note end,
    start_prob = excluded.start_prob, value = coalesce(excluded.value, p.value),
    source_history = coalesce(excluded.source_history, p.source_history),
    streak_days = coalesce(excluded.streak_days, p.streak_days),
    acceleration = coalesce(excluded.acceleration, p.acceleration),
    next_opponent_id = coalesce(excluded.next_opponent_id, p.next_opponent_id),
    next_home = coalesce(excluded.next_home, p.next_home),
    next_matchday = coalesce(excluded.next_matchday, p.next_matchday),
    points_total = coalesce(excluded.points_total, p.points_total),
    points_avg = coalesce(excluded.points_avg, p.points_avg),
    points5 = coalesce(excluded.points5, p.points5),
    played5 = coalesce(excluded.played5, p.played5),
    matches_played = coalesce(excluded.matches_played, p.matches_played),
    last_points = coalesce(excluded.last_points, p.last_points),
    source = excluded.source, source_id = excluded.source_id, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fos_update_points(p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  update players p set points_total = x.points_total, points_avg = x.points_avg, points5 = x.points5,
         played5 = x.played5, matches_played = x.matches_played, last_points = x.last_points
    from jsonb_to_recordset(p_rows) as x(id text, points_total integer, points_avg double precision, points5 integer,
         played5 integer, matches_played integer, last_points integer)
   where p.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fos_update_availability(p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  update players p set status = x.status, start_prob = coalesce(x.start_prob, p.start_prob), status_note = x.note
    from jsonb_to_recordset(p_rows) as x(id text, status text, start_prob double precision, note text)
   where p.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fos_upsert_fixtures(p_ws text, p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into fixtures as f (id, ws, season, matchday, kickoff, date, home_id, away_id, home_score, away_score, source, updated_at)
  select x.id, p_ws, x.season, x.matchday, x.kickoff, x.date, x.home_id, x.away_id, x.home_score, x.away_score, x.source, coalesce(x.updated_at, now())
    from jsonb_to_recordset(p_rows) as x(id text, season text, matchday integer, kickoff timestamptz, date date, home_id text,
         away_id text, home_score integer, away_score integer, source text, updated_at timestamptz)
  on conflict (id) do update set matchday = excluded.matchday, kickoff = coalesce(excluded.kickoff, f.kickoff),
    date = excluded.date, home_score = excluded.home_score, away_score = excluded.away_score,
    source = excluded.source, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.fos_snapshot_days(p_ws text) returns integer
language sql stable set search_path = public as $$
  select count(distinct date)::int from price_snapshots where ws = p_ws;
$$;

create or replace function public.fos_user_ids(p_ws text) returns setof text
language sql stable set search_path = public as $$
  select distinct user_id from settings where ws = p_ws
  union select distinct user_id from squad where ws = p_ws;
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'fos\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
