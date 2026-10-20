-- Puntos de cada jugador por jornada (once ideal). Datos compartidos, separados por espacio (ws).

create table if not exists public.matchday_points (
  ws text not null default 'real' check (ws in ('real','demo')),
  matchday integer not null,
  player_id text not null references public.players(id) on delete cascade,
  points integer not null,
  updated_at timestamptz not null default now(),
  primary key (ws, matchday, player_id)
);
alter table public.matchday_points enable row level security;
revoke all on table public.matchday_points from public, anon, authenticated;
grant select, insert, update, delete on table public.matchday_points to service_role;

create or replace function public.fos_points_matchdays(p_ws text) returns setof integer
language sql stable set search_path = public as $$
  select distinct matchday from matchday_points where ws = p_ws order by 1;
$$;
revoke all on function public.fos_points_matchdays(text) from public, anon, authenticated;
grant execute on function public.fos_points_matchdays(text) to service_role;
