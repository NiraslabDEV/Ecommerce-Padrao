-- ============================================================================
-- ECOMMERCE-PADRÃO — E3: Produtos relacionados ("quem viu isto também viu")
-- Ref: ECOMMERCE.md (E3), CLAUDE.md secções 4 (RLS/RPC), 14.1/14.2
--
-- product_related        → curadoria manual do staff (fixar relacionados por produto)
-- get_related_products() → SECURITY DEFINER, devolve até 10 produtos na ordem:
--   (a) CURADOS pelo admin (product_related, por sort)
--   (b) CO-VIEW comportamental (outros itens vistos nas mesmas sessões que
--       viram p_item_id, em analytics_events type='view_item', payload->>'item_id')
--   (c) FALLBACK mesma categoria
--   — sempre a excluir p_item_id, duplicados, itens indisponíveis e brindes.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: curadoria de relacionados (staff)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.product_related (
  id              uuid        primary key default gen_random_uuid(),
  item_id         uuid        not null references public.menu_items(id) on delete cascade,
  related_item_id uuid        not null references public.menu_items(id) on delete cascade,
  sort            int         not null default 0,
  created_at      timestamptz not null default now(),
  unique (item_id, related_item_id)
);

alter table public.product_related enable row level security;

-- staff (qualquer authenticated, single-tenant) gere tudo. anon: NENHUMA policy.
create policy "staff_all" on public.product_related
  for all to authenticated using (true) with check (true);

create index if not exists product_related_item_idx
  on public.product_related (item_id, sort);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_related_products(p_item_id uuid) — pública (loja), SECURITY DEFINER.
-- Devolve jsonb array de até 10 produtos: { id, name, price_cents, photo_url }.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_related_products(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result      jsonb;
  v_category_id uuid;
begin
  -- categoria do produto de referência (para o fallback (c))
  select category_id into v_category_id
  from menu_items
  where id = p_item_id;

  with
  -- (a) curados pelo admin — tier 0, ordenados por sort
  curated as (
    select pr.related_item_id as cand_id,
           0                  as tier,
           pr.sort            as ord,
           null::bigint       as score
    from product_related pr
    where pr.item_id = p_item_id
  ),
  -- sessões que viram p_item_id
  seed_sessions as (
    select distinct session_id
    from analytics_events
    where type = 'view_item'
      and payload ->> 'item_id' = p_item_id::text
  ),
  -- (b) co-view — outros itens vistos nessas sessões, mais frequentes primeiro
  co_view as (
    select (ae.payload ->> 'item_id')::uuid as cand_id,
           1                                 as tier,
           0                                 as ord,
           count(*)                          as score
    from analytics_events ae
    join seed_sessions s on s.session_id = ae.session_id
    where ae.type = 'view_item'
      and ae.payload ->> 'item_id' is not null
      and ae.payload ->> 'item_id' <> p_item_id::text
    group by (ae.payload ->> 'item_id')::uuid
  ),
  -- (c) fallback: mesma categoria — tier 2, por sort
  same_cat as (
    select mi.id  as cand_id,
           2      as tier,
           mi.sort as ord,
           0::bigint as score
    from menu_items mi
    where mi.category_id = v_category_id
      and mi.id <> p_item_id
  ),
  unioned as (
    select * from curated
    union all
    select * from co_view
    union all
    select * from same_cat
  ),
  -- dedupe: por candidato, manter a melhor origem (menor tier); desempate por score/ord
  ranked as (
    select distinct on (u.cand_id)
           u.cand_id, u.tier, u.ord, u.score
    from unioned u
    order by u.cand_id, u.tier asc, u.score desc nulls last, u.ord asc
  )
  select coalesce(jsonb_agg(x.obj order by x.rn), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
             'id',          mi.id,
             'name',        mi.name,
             'price_cents', mi.price_cents,
             'photo_url',   mi.photo_url
           ) as obj,
           row_number() over (
             order by r.tier asc, r.score desc nulls last, r.ord asc, mi.name asc
           ) as rn
    from ranked r
    join menu_items mi on mi.id = r.cand_id
    where mi.available = true
      and coalesce(mi.is_gift, false) = false
      and mi.id <> p_item_id
  ) x
  where x.rn <= 10;

  return v_result;
end;
$$;

-- Público (loja) — mesmo padrão de get_menu. Fecha a PUBLIC e concede explicitamente.
revoke all on function public.get_related_products(uuid) from public;
grant execute on function public.get_related_products(uuid) to anon, authenticated, service_role;
