-- Cláusulas de los jugadores de la plantilla y gastos por subirlas.

alter table public.squad add column if not exists clause bigint;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('compra','venta','ajuste','clausula'));

create or replace function public.fos_set_clause(p_user text, p_ws text, p_player text, p_clause bigint, p_cost bigint, p_date date, p_notes text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_name text;
  v_budget bigint;
begin
  if p_clause <= 0 then raise exception 'FOS:400:La cláusula debe ser mayor que cero.'; end if;
  if p_cost < 0 then raise exception 'FOS:400:El coste no puede ser negativo.'; end if;
  perform 1 from settings where user_id = p_user and ws = p_ws and key = 'budget' for update;
  select p.name into v_name from squad s join players p on p.id = s.player_id
   where s.user_id = p_user and s.ws = p_ws and s.player_id = p_player;
  if v_name is null then raise exception 'FOS:404:Ese jugador no está en tu plantilla.'; end if;
  v_budget := fos_budget(p_user, p_ws) - p_cost;
  if p_cost > 0 and v_budget < 0 then
    raise exception 'FOS:422:Presupuesto insuficiente: te faltan % €.', to_char(-v_budget, 'FM999G999G999G999');
  end if;
  update squad set clause = p_clause where user_id = p_user and ws = p_ws and player_id = p_player;
  if p_cost > 0 then
    insert into transactions (user_id, ws, type, player_id, player_name, amount, date, notes)
      values (p_user, p_ws, 'clausula', p_player, v_name, p_cost, p_date, p_notes);
    perform fos_put_setting(p_user, p_ws, 'budget', to_jsonb(v_budget));
  end if;
  return jsonb_build_object('budget', fos_budget(p_user, p_ws));
end $$;

revoke all on function public.fos_set_clause(text, text, text, bigint, bigint, date, text) from public, anon, authenticated;
grant execute on function public.fos_set_clause(text, text, text, bigint, bigint, date, text) to service_role;
