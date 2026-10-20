-- Notificaciones push: una suscripción por dispositivo y el último estado avisado de cada cosa
-- (para no repetir el mismo aviso).

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

create table if not exists public.notify_state (
  user_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.notify_state enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.notify_state from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.notify_state to service_role;
