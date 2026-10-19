-- Fantasy OS — esquema para Supabase (Postgres)
-- Se aplica una vez (SQL Editor o migración). Idempotente donde es posible.
--
-- Modelo de seguridad:
--   * El navegador solo usa la clave pública para iniciar sesión (Supabase Auth).
--   * Todo acceso a datos lo hace el servidor de Next.js con la clave secreta,
--     filtrando siempre por el usuario autenticado (user_id) y el espacio (ws).
--   * RLS activado en todas las tablas y sin políticas: con la clave pública no se
--     puede leer ni escribir nada.
--   * ws = 'real' | 'demo': los datos de demostración nunca se mezclan con los reales.

create table if not exists public.players (
  id text primary key,
  ws text not null default 'real' check (ws in ('real','demo')),
  name text not null,
  short_name text,
  norm_name text not null,
  team_id text,
  position text not null,
  status text not null default 'desconocido',
  status_note text,
  start_prob double precision,
  value bigint,
  source_history jsonb,
  streak_days integer,
  acceleration bigint,
  next_opponent_id text,
  next_home boolean,
  next_matchday integer,
  points_total integer,
  points_avg double precision,
  points5 integer,
  played5 integer,
  matches_played integer,
  last_points integer,
  source text not null,
  source_id text,
  updated_at timestamptz not null default now()
);
create index if not exists players_ws_norm on public.players (ws, norm_name, team_id);
create index if not exists players_ws_source on public.players (ws, source, source_id);

create table if not exists public.player_overrides (
  user_id text not null,
  ws text not null default 'real',
  player_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, ws, player_id)
);

create table if not exists public.price_snapshots (
  player_id text not null,
  date date not null,
  ws text not null default 'real',
  value bigint not null,
  source text not null,
  primary key (player_id, date)
);
create index if not exists price_snapshots_ws_date on public.price_snapshots (ws, date);

create table if not exists public.squad (
  user_id text not null,
  ws text not null default 'real',
  player_id text not null,
  purchase_price bigint not null,
  purchase_date date not null,
  notes text,
  primary key (user_id, ws, player_id)
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id text not null,
  ws text not null default 'real',
  type text not null check (type in ('compra','venta','ajuste')),
  player_id text,
  player_name text not null,
  amount bigint not null,
  cost_basis bigint,
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user on public.transactions (user_id, ws, date desc);

create table if not exists public.market_listings (
  id bigint generated always as identity primary key,
  user_id text not null,
  ws text not null default 'real',
  date date not null,
  player_id text not null,
  asking_price bigint,
  seller text,
  unique (user_id, ws, date, player_id)
);

create table if not exists public.fixtures (
  id text primary key,
  ws text not null default 'real',
  season text not null,
  matchday integer not null,
  kickoff timestamptz,
  date date not null,
  home_id text not null,
  away_id text not null,
  home_score integer,
  away_score integer,
  source text not null,
  updated_at timestamptz not null default now()
);
create index if not exists fixtures_ws_md on public.fixtures (ws, matchday);

create table if not exists public.probable_lineups (
  id bigint generated always as identity primary key,
  ws text not null default 'real',
  matchday integer not null,
  team_id text not null,
  player_name text not null,
  player_id text,
  role text not null,
  probability double precision,
  source text not null,
  updated_at timestamptz not null default now(),
  manual boolean not null default false
);
create index if not exists probable_lineups_ws_md on public.probable_lineups (ws, matchday, team_id);

create table if not exists public.settings (
  user_id text not null,
  ws text not null default 'real',
  key text not null,
  value jsonb not null,
  primary key (user_id, ws, key)
);

create table if not exists public.squad_value_history (
  user_id text not null,
  ws text not null default 'real',
  date date not null,
  squad_value bigint not null,
  budget bigint not null,
  primary key (user_id, ws, date)
);

create table if not exists public.sync_log (
  id bigint generated always as identity primary key,
  ws text not null default 'real',
  source text not null,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  message text,
  count integer
);
create index if not exists sync_log_lookup on public.sync_log (ws, source, kind, status, id desc);

-- RLS sin políticas: nadie con la clave pública accede a los datos.
alter table public.players enable row level security;
alter table public.player_overrides enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.squad enable row level security;
alter table public.transactions enable row level security;
alter table public.market_listings enable row level security;
alter table public.fixtures enable row level security;
alter table public.probable_lineups enable row level security;
alter table public.settings enable row level security;
alter table public.squad_value_history enable row level security;
alter table public.sync_log enable row level security;

-- ───────────────────────── Funciones (operaciones atómicas) ─────────────────────────
-- Los errores de negocio se lanzan como 'FOS:<status>:<mensaje>' y la app los traduce.

create or replace function public.fos_budget(p_user text, p_ws text) returns bigint
language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from settings where user_id = p_user and ws = p_ws and key = 'budget'), 0);
$$;

create or replace function public.fos_put_setting(p_user text, p_ws text, p_key text, p_value jsonb) returns void
language sql set search_path = public as $$
  insert into settings (user_id, ws, key, value) values (p_user, p_ws, p_key, p_value)
  on conflict (user_id, ws, key) do update set value = excluded.value;
$$;

create or replace function public.fos_drop_from_lineup(p_user text, p_ws text, p_player text) returns void
language sql set search_path = public as $$
  update settings s
     set value = (select coalesce(jsonb_object_agg(k, case when v = to_jsonb(p_player) then 'null'::jsonb else v end), '{}'::jsonb)
                    from jsonb_each(s.value) as e(k, v))
   where s.user_id = p_user and s.ws = p_ws and s.key = 'lineup';
$$;

create or replace function public.fos_buy(p_user text, p_ws text, p_player text, p_price bigint, p_date date, p_notes text, p_allow_negative boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_name text;
  v_budget bigint;
  v_max int;
  v_count int;
begin
  if p_price <= 0 then raise exception 'FOS:400:El precio debe ser mayor que cero.'; end if;
  select name into v_name from players where id = p_player;
  if v_name is null then raise exception 'FOS:404:Jugador no encontrado'; end if;
  -- bloquea la fila del saldo para evitar compras simultáneas
  perform 1 from settings where user_id = p_user and ws = p_ws and key = 'budget' for update;
  if exists (select 1 from squad where user_id = p_user and ws = p_ws and player_id = p_player) then
    raise exception 'FOS:409:Ese jugador ya está en tu plantilla.';
  end if;
  v_max := coalesce((select (value #>> '{}')::int from settings where user_id = p_user and ws = p_ws and key = 'maxSquadSize'), 24);
  select count(*) into v_count from squad where user_id = p_user and ws = p_ws;
  if v_count >= v_max then raise exception 'FOS:400:Plantilla completa (%).', v_max; end if;
  v_budget := fos_budget(p_user, p_ws) - p_price;
  if v_budget < 0 and not coalesce(p_allow_negative, false) then
    raise exception 'FOS:422:Presupuesto insuficiente: te faltan % €.', replace(to_char(-v_budget, 'FM999,999,999,999'), ',', '.');
  end if;
  insert into squad (user_id, ws, player_id, purchase_price, purchase_date, notes) values (p_user, p_ws, p_player, p_price, p_date, p_notes);
  insert into transactions (user_id, ws, type, player_id, player_name, amount, date, notes) values (p_user, p_ws, 'compra', p_player, v_name, p_price, p_date, p_notes);
  perform fos_put_setting(p_user, p_ws, 'budget', to_jsonb(v_budget));
  delete from market_listings where user_id = p_user and ws = p_ws and player_id = p_player;
  return jsonb_build_object('budget', v_budget);
end $$;

create or replace function public.fos_sell(p_user text, p_ws text, p_player text, p_price bigint, p_date date, p_notes text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_name text;
  v_cost bigint;
  v_budget bigint;
begin
  if p_price < 0 then raise exception 'FOS:400:El precio de venta no puede ser negativo.'; end if;
  select name into v_name from players where id = p_player;
  if v_name is null then raise exception 'FOS:404:Jugador no encontrado'; end if;
  perform 1 from settings where user_id = p_user and ws = p_ws and key = 'budget' for update;
  delete from squad where user_id = p_user and ws = p_ws and player_id = p_player returning purchase_price into v_cost;
  if v_cost is null then raise exception 'FOS:404:Ese jugador no está en tu plantilla.'; end if;
  insert into transactions (user_id, ws, type, player_id, player_name, amount, cost_basis, date, notes)
    values (p_user, p_ws, 'venta', p_player, v_name, p_price, v_cost, p_date, p_notes);
  v_budget := fos_budget(p_user, p_ws) + p_price;
  perform fos_put_setting(p_user, p_ws, 'budget', to_jsonb(v_budget));
  perform fos_drop_from_lineup(p_user, p_ws, p_player);
  return jsonb_build_object('budget', v_budget, 'profit', p_price - v_cost);
end $$;

create or replace function public.fos_set_budget(p_user text, p_ws text, p_budget bigint, p_date date, p_notes text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_diff bigint;
begin
  perform 1 from settings where user_id = p_user and ws = p_ws and key = 'budget' for update;
  v_diff := p_budget - fos_budget(p_user, p_ws);
  if v_diff <> 0 then
    insert into transactions (user_id, ws, type, player_id, player_name, amount, date, notes)
      values (p_user, p_ws, 'ajuste', null, case when v_diff > 0 then 'Ajuste de saldo (+)' else 'Ajuste de saldo (−)' end, abs(v_diff), p_date, p_notes);
  end if;
  perform fos_put_setting(p_user, p_ws, 'budget', to_jsonb(p_budget));
  return jsonb_build_object('budget', p_budget, 'diff', v_diff);
end $$;

create or replace function public.fos_relink_player(p_from text, p_to text) returns void
language plpgsql set search_path = public as $$
begin
  if p_from = p_to then return; end if;
  delete from squad s where s.player_id = p_from and exists (select 1 from squad t where t.player_id = p_to and t.user_id = s.user_id and t.ws = s.ws);
  update squad set player_id = p_to where player_id = p_from;
  delete from market_listings m where m.player_id = p_from and exists (select 1 from market_listings t where t.player_id = p_to and t.user_id = m.user_id and t.ws = m.ws and t.date = m.date);
  update market_listings set player_id = p_to where player_id = p_from;
  update transactions set player_id = p_to where player_id = p_from;
  update probable_lineups set player_id = p_to where player_id = p_from;
  delete from player_overrides o where o.player_id = p_from and exists (select 1 from player_overrides t where t.player_id = p_to and t.user_id = o.user_id and t.ws = o.ws);
  update player_overrides set player_id = p_to where player_id = p_from;
  delete from price_snapshots s where s.player_id = p_from and exists (select 1 from price_snapshots t where t.player_id = p_to and t.date = s.date);
  update price_snapshots set player_id = p_to where player_id = p_from;
  update settings s
     set value = (select coalesce(jsonb_object_agg(k, case when v = to_jsonb(p_from) then to_jsonb(p_to) else v end), '{}'::jsonb) from jsonb_each(s.value) as e(k, v))
   where s.key = 'lineup' and s.value::text like '%' || p_from || '%';
  delete from players where id = p_from;
end $$;

create or replace function public.fos_recent_snapshots(p_ws text, p_since date)
returns table (player_id text, dates date[], vals bigint[])
language sql stable set search_path = public as $$
  select s.player_id, array_agg(s.date order by s.date), array_agg(s.value order by s.date)
    from price_snapshots s
   where s.ws = p_ws and s.date >= p_since
   group by s.player_id;
$$;

create or replace function public.fos_replace_lineup(p_ws text, p_matchday int, p_team text, p_entries jsonb) returns void
language plpgsql set search_path = public as $$
begin
  delete from probable_lineups where ws = p_ws and matchday = p_matchday and team_id = p_team and manual = false;
  insert into probable_lineups (ws, matchday, team_id, player_name, player_id, role, probability, source, updated_at, manual)
  select p_ws, p_matchday, p_team, e->>'playerName', e->>'playerId', e->>'role', (e->>'probability')::double precision,
         e->>'source', coalesce((e->>'updatedAt')::timestamptz, now()), false
    from jsonb_array_elements(p_entries) e
   where not exists (
     select 1 from probable_lineups m
      where m.ws = p_ws and m.matchday = p_matchday and m.team_id = p_team and m.manual
        and lower(m.player_name) = lower(e->>'playerName'));
end $$;

create or replace function public.fos_reset_ws(p_user text, p_ws text) returns void
language plpgsql set search_path = public as $$
begin
  if p_ws <> 'demo' then raise exception 'FOS:400:Solo se puede regenerar el espacio de demostración.'; end if;
  delete from price_snapshots where ws = p_ws;
  delete from probable_lineups where ws = p_ws;
  delete from fixtures where ws = p_ws;
  delete from players where ws = p_ws;
  delete from sync_log where ws = p_ws;
  delete from player_overrides where user_id = p_user and ws = p_ws;
  delete from squad where user_id = p_user and ws = p_ws;
  delete from transactions where user_id = p_user and ws = p_ws;
  delete from market_listings where user_id = p_user and ws = p_ws;
  delete from settings where user_id = p_user and ws = p_ws;
  delete from squad_value_history where user_id = p_user and ws = p_ws;
end $$;

-- Solo el servidor (clave secreta / service_role) puede ejecutar las funciones.
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
