-- Disciplina por jugador (tarjetas y apercibidos) y resultados que no se pierden al resincronizar.

alter table public.players add column if not exists yellow_cards integer;
alter table public.players add column if not exists red_cards integer;
alter table public.players add column if not exists warned boolean;

create or replace function public.fos_update_discipline(p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  update players p set yellow_cards = coalesce(x.yellow, p.yellow_cards), red_cards = coalesce(x.red, p.red_cards), warned = x.warned
    from jsonb_to_recordset(p_rows) as x(id text, yellow integer, red integer, warned boolean)
   where p.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Un resultado conocido (p. ej. de FútbolFantasy) no se borra si otra fuente aún no lo tiene.
create or replace function public.fos_upsert_fixtures(p_ws text, p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into fixtures as f (id, ws, season, matchday, kickoff, date, home_id, away_id, home_score, away_score, source, updated_at)
  select x.id, p_ws, x.season, x.matchday, x.kickoff, x.date, x.home_id, x.away_id, x.home_score, x.away_score, x.source, coalesce(x.updated_at, now())
    from jsonb_to_recordset(p_rows) as x(id text, season text, matchday integer, kickoff timestamptz, date date, home_id text,
         away_id text, home_score integer, away_score integer, source text, updated_at timestamptz)
  on conflict (id) do update set matchday = excluded.matchday, kickoff = coalesce(excluded.kickoff, f.kickoff),
    date = excluded.date, home_score = coalesce(excluded.home_score, f.home_score), away_score = coalesce(excluded.away_score, f.away_score),
    source = excluded.source, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.fos_update_discipline(jsonb) from public, anon, authenticated;
grant execute on function public.fos_update_discipline(jsonb) to service_role;
revoke all on function public.fos_upsert_fixtures(text, jsonb) from public, anon, authenticated;
grant execute on function public.fos_upsert_fixtures(text, jsonb) to service_role;
