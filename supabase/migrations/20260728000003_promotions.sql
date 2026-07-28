-- ============================================================================
-- CORTES DE PREÇO (promoções) — padrão único do template.
-- Spec completa: docs/precos-e-promocoes.md · espelho TS: packages/core/src/pricing.ts
--
-- Modelo (decisões fechadas):
--   1. menu_items.price_cents é SEMPRE o preço de tabela. Campanhas NUNCA o reescrevem
--      (desligar a campanha devolve o preço antigo, sem perder nada).
--   2. menu_items.compare_at_price_cents = o "de X" riscado de UM produto
--      ("de 1200 por 900"). Ignorado se ≤ price_cents (não inventa desconto).
--   3. promotions = REGRAS por escopo: 'store' (loja inteira), 'category'
--      (ex.: todos os perfumes -30%) ou 'item'. Em 'pct' (%) ou 'cents' (MT fixo).
--   4. NÃO acumulam: aplica-se o MAIOR desconto entre as campanhas aplicáveis.
--   5. public.effective_price() é a ÚNICA fonte do preço final — usada pelo
--      get_menu() (vitrine) e pelo create_order() (cobrança). O client nunca decide preço.
-- ============================================================================

-- ── 1. Corte manual por produto ("de X por Y") ───────────────────────────────
alter table menu_items add column if not exists compare_at_price_cents int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'menu_items_compare_at_price_cents_check'
  ) then
    alter table menu_items add constraint menu_items_compare_at_price_cents_check
      check (compare_at_price_cents is null or compare_at_price_cents >= 0);
  end if;
end $$;

comment on column menu_items.compare_at_price_cents is
  'Preço ANTES do corte (riscado na loja). NULL = sem corte manual. Ignorado se <= price_cents.';

-- ── 2. Campanhas em massa ────────────────────────────────────────────────────
create table if not exists promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  scope          text not null check (scope in ('store', 'category', 'item')),
  category_id    uuid references menu_categories(id) on delete cascade,
  menu_item_id   uuid references menu_items(id)      on delete cascade,
  discount_type  text not null check (discount_type in ('pct', 'cents')),
  discount_value int  not null check (discount_value > 0),
  active         bool not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now(),
  -- o escopo tem de trazer o alvo certo
  constraint promotions_scope_target_check check (
    (scope = 'store'    and category_id is null and menu_item_id is null) or
    (scope = 'category' and category_id is not null and menu_item_id is null) or
    (scope = 'item'     and menu_item_id is not null and category_id is null)
  ),
  -- percentagem só faz sentido entre 1 e 100
  constraint promotions_pct_range_check check (
    discount_type <> 'pct' or discount_value between 1 and 100
  )
);

comment on table promotions is
  'Campanhas de desconto (loja/categoria/produto). Não acumulam: vence o maior desconto.';

create index if not exists promotions_active_idx on promotions (active, scope);

alter table promotions enable row level security;

-- staff = authenticated (single-tenant). anon NUNCA lê promotions direto:
-- os preços já chegam calculados pelo get_menu() (SECURITY DEFINER).
drop policy if exists "staff_all" on promotions;
create policy "staff_all" on promotions for all to authenticated using (true) with check (true);

-- ── 3. Motor de preço (fonte única) ──────────────────────────────────────────

-- Maior desconto (em centavos) das campanhas ativas aplicáveis a este produto.
create or replace function public.promo_discount_cents(
  p_base_cents  int,
  p_item_id     uuid,
  p_category_id uuid
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
    case
      when p.discount_type = 'pct'
        then least(
          round(greatest(coalesce(p_base_cents, 0), 0)::numeric * least(p.discount_value, 100) / 100)::int,
          greatest(coalesce(p_base_cents, 0), 0)
        )
      else least(p.discount_value, greatest(coalesce(p_base_cents, 0), 0))
    end
  ), 0)
  from promotions p
  where p.active
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at   is null or p.ends_at   >  now())
    and (
      p.scope = 'store'
      or (p.scope = 'category' and p.category_id  = p_category_id)
      or (p.scope = 'item'     and p.menu_item_id = p_item_id)
    );
$$;

-- Preço final em centavos (é ISTO que o create_order cobra).
create or replace function public.effective_price_cents(
  p_base_cents  int,
  p_item_id     uuid,
  p_category_id uuid
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    greatest(coalesce(p_base_cents, 0), 0)
      - public.promo_discount_cents(p_base_cents, p_item_id, p_category_id),
    0
  );
$$;

-- Bloco de preço para a vitrine: { price_cents, compare_at_cents, discount_pct }.
-- compare_at_cents = maior entre o "de X" do produto e o preço de tabela (ou null).
create or replace function public.effective_price(
  p_base_cents       int,
  p_compare_at_cents int,
  p_item_id          uuid,
  p_category_id      uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with calc as (
    select
      public.effective_price_cents(p_base_cents, p_item_id, p_category_id) as final_cents,
      greatest(coalesce(p_compare_at_cents, 0), greatest(coalesce(p_base_cents, 0), 0)) as reference_cents
  )
  select jsonb_build_object(
    'price_cents',      calc.final_cents,
    'compare_at_cents', case when calc.reference_cents > calc.final_cents then calc.reference_cents else null end,
    'discount_pct',     case
                          when calc.reference_cents > calc.final_cents
                            then round((1 - calc.final_cents::numeric / calc.reference_cents) * 100)::int
                          else 0
                        end
  )
  from calc;
$$;

revoke all on function public.promo_discount_cents(int, uuid, uuid) from public;
revoke all on function public.effective_price_cents(int, uuid, uuid) from public;
revoke all on function public.effective_price(int, int, uuid, uuid) from public;
grant execute on function public.effective_price_cents(int, uuid, uuid) to authenticated, service_role;
grant execute on function public.effective_price(int, int, uuid, uuid) to authenticated, service_role;
grant execute on function public.promo_discount_cents(int, uuid, uuid) to authenticated, service_role;

-- ── 4. get_menu(): preços já cortados + riscado + badge ──────────────────────
-- Base: 20260728000002_menu_item_photo2.sql. Mudança: cada item e cada variante
-- passam por effective_price() (merge jsonb — o price_cents final SUBSTITUI o de tabela).
create or replace function public.get_menu()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_s record;
begin
  select * into v_s from settings where id = 1;

  return jsonb_build_object(
    'accepting_orders',  v_s.accepting_orders,
    'payment_provider',  v_s.payment_provider,
    'mpesa_number',      v_s.mpesa_number,
    'mpesa_name',        v_s.mpesa_name,
    'emola_number',      v_s.emola_number,
    'emola_name',        v_s.emola_name,
    -- campos públicos de promoção (nunca secrets)
    'promo_banner_url',  v_s.promo_banner_url,
    'promo_code',        v_s.promo_code,
    -- SÓ campos (A) públicos de marketing. NUNCA meta_capi_token / gads_developer_token.
    'marketing', jsonb_build_object(
      'gtm_container_id',      v_s.gtm_container_id,
      'meta_pixel_id',         v_s.meta_pixel_id,
      'ga4_measurement_id',    v_s.ga4_measurement_id,
      'gads_conversion_id',    v_s.gads_conversion_id,
      'gads_conversion_label', v_s.gads_conversion_label
    ),
    'banners', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',          b.id,
          'image_url',   b.image_url,
          'media_type',  b.media_type,
          'category_id', b.category_id,
          'custom_url',  b.custom_url
        ) order by b.sort
      ), '[]'::jsonb)
      from storefront_banners b where b.active = true
    ),
    'categories', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',        c.id,
          'name',      c.name,
          'station',   c.station,
          'sort',      c.sort,
          'photo_url', c.photo_url,
          'items', (
            select coalesce(jsonb_agg(
              (
                jsonb_build_object(
                  'id',          i.id,
                  'name',        i.name,
                  'description', i.description,
                  'price_cents', i.price_cents,
                  'photo_url',   i.photo_url,
                  'photo_url_2', i.photo_url_2,
                  'video_url',   i.video_url,
                  'available',   i.available,
                  'track_stock', i.track_stock,
                  'stock_qty',   case when i.track_stock then i.stock_qty else null end,
                  'variants', (
                    select coalesce(jsonb_agg(
                      (
                        jsonb_build_object(
                          'id',          v.id,
                          'name',        v.name,
                          'price_cents', v.price_cents,
                          'is_default',  v.is_default
                        )
                        -- variante também entra em campanha (o desconto é do produto)
                        || public.effective_price(v.price_cents, null, i.id, c.id)
                      ) order by v.sort
                    ), '[]'::jsonb)
                    from menu_item_variants v
                    where v.menu_item_id = i.id and v.active = true
                  ),
                  -- adicionais NÃO entram em campanha (o desconto é do produto)
                  'addons', (
                    select coalesce(jsonb_agg(
                      jsonb_build_object(
                        'id',          a.id,
                        'name',        a.name,
                        'price_cents', a.price_cents
                      ) order by a.sort
                    ), '[]'::jsonb)
                    from menu_addons a
                    where a.menu_item_id = i.id and a.active = true
                  )
                )
                -- ⭐ preço final + riscado + % (substitui price_cents pelo preço a pagar)
                || public.effective_price(i.price_cents, i.compare_at_price_cents, i.id, c.id)
              ) order by i.sort
            ), '[]'::jsonb)
            from menu_items i
            where i.category_id = c.id and i.available = true
          )
        ) order by c.sort
      ), '[]'::jsonb)
      from menu_categories c where c.active = true
    ),
    'zones', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',        z.id,
          'name',      z.name,
          'fee_cents', z.fee_cents,
          'sort',      z.sort
        ) order by z.sort
      ), '[]'::jsonb)
      from delivery_zones z where z.active = true
    )
  );
end;
$$;

grant execute on function public.get_menu() to anon;

-- ── 5. get_related_products(): mesmos preços da vitrine ──────────────────────
-- (o carrossel "também pode gostar" tem de mostrar o preço com desconto)
-- Base: 20260720000001_related_products.sql (curadoria → co-view → mesma categoria).
-- ÚNICA mudança: o objeto de saída passa por effective_price().
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
  select category_id into v_category_id from menu_items where id = p_item_id;

  with
  curated as (
    select pr.related_item_id as cand_id, 0 as tier, pr.sort as ord, null::bigint as score
    from product_related pr
    where pr.item_id = p_item_id
  ),
  seed_sessions as (
    select distinct session_id
    from analytics_events
    where type = 'view_item' and payload ->> 'item_id' = p_item_id::text
  ),
  co_view as (
    select (ae.payload ->> 'item_id')::uuid as cand_id, 1 as tier, 0 as ord, count(*) as score
    from analytics_events ae
    join seed_sessions s on s.session_id = ae.session_id
    where ae.type = 'view_item'
      and ae.payload ->> 'item_id' is not null
      and ae.payload ->> 'item_id' <> p_item_id::text
    group by (ae.payload ->> 'item_id')::uuid
  ),
  same_cat as (
    select mi.id as cand_id, 2 as tier, mi.sort as ord, 0::bigint as score
    from menu_items mi
    where mi.category_id = v_category_id and mi.id <> p_item_id
  ),
  unioned as (
    select * from curated
    union all select * from co_view
    union all select * from same_cat
  ),
  ranked as (
    select distinct on (u.cand_id) u.cand_id, u.tier, u.ord, u.score
    from unioned u
    order by u.cand_id, u.tier asc, u.score desc nulls last, u.ord asc
  )
  select coalesce(jsonb_agg(x.obj order by x.rn), '[]'::jsonb)
  into v_result
  from (
    select (
             jsonb_build_object(
               'id',          mi.id,
               'name',        mi.name,
               'price_cents', mi.price_cents,
               'photo_url',   mi.photo_url
             )
             -- ⭐ mesmo preço da vitrine (com corte, se houver)
             || public.effective_price(mi.price_cents, mi.compare_at_price_cents, mi.id, mi.category_id)
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

revoke all on function public.get_related_products(uuid) from public;
grant execute on function public.get_related_products(uuid) to anon, authenticated, service_role;

-- ── 6. create_order(): cobra o MESMO preço que a vitrine mostra ──────────────
-- Base: 20260618000001_fix_create_order_vrc.sql. Mudança: após resolver o preço
-- (base ou variante) aplica-se effective_price_cents(); os adicionais somam DEPOIS
-- (não são descontados). O client continua sem poder decidir preço nenhum.
create or replace function public.create_order(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg          record;
  v_items        jsonb;
  v_item_el      jsonb;
  v_menu_item    record;
  v_variant      record;
  v_addon_ids    jsonb;
  v_addon_id     text;
  v_addon        record;
  v_addons_snap  jsonb;
  v_variant_name text;
  v_zone         record;
  v_rc           record;
  v_order_id     uuid;
  v_order_number text;
  v_subtotal     int := 0;
  v_delivery_fee int := 0;
  v_discount     int := 0;
  v_total        int;
  v_qty          int;
  v_unit_price   int;
  v_redeemed     int;
  v_gift_item_id uuid;

  v_customer_name    text;
  v_customer_phone   text;
  v_customer_email   text;
  v_fulfillment_type text;
  v_delivery_zone_id uuid;
  v_address          text;
  v_payment_method   text;
  v_notes            text;
  v_referral_code    text;
  v_scheduled_for    timestamptz;
  v_slot_hour        int;
  v_slot_minute      int;
  v_flow             text;
  v_has_gift_item    bool := false;
begin
  -- 1. Settings
  select * into v_cfg from settings where id = 1;

  if not v_cfg.accepting_orders then
    raise exception 'store_closed' using errcode = 'P0001';
  end if;

  -- 2. Flow
  if v_cfg.payment_provider in ('paysuite', 'mock') then
    v_flow := 'digital';
  else
    v_flow := 'manual';
  end if;

  -- 3. Payload
  v_items            := p_payload -> 'items';
  v_customer_name    := nullif(trim(p_payload ->> 'customerName'), '');
  v_customer_phone   := nullif(trim(p_payload ->> 'customerPhone'), '');
  v_customer_email   := nullif(trim(p_payload ->> 'customerEmail'), '');
  v_fulfillment_type := p_payload ->> 'fulfillmentType';
  v_delivery_zone_id := (p_payload ->> 'deliveryZoneId')::uuid;
  v_address          := trim(p_payload ->> 'address');
  v_payment_method   := p_payload ->> 'paymentMethod';
  v_notes            := trim(p_payload ->> 'notes');
  v_referral_code    := nullif(upper(trim(p_payload ->> 'referralCode')), '');

  if p_payload ->> 'scheduledFor' is not null then
    v_scheduled_for := (p_payload ->> 'scheduledFor')::timestamptz;
  end if;

  if v_customer_name is null or length(v_customer_name) = 0 then
    raise exception 'invalid_customer_name' using errcode = 'P0003';
  end if;

  if v_fulfillment_type not in ('pickup', 'delivery') then
    raise exception 'invalid_fulfillment_type' using errcode = 'P0004';
  end if;

  if v_payment_method not in ('mpesa', 'emola', 'credit_card', 'cash') then
    raise exception 'invalid_payment_method' using errcode = 'P0005';
  end if;

  -- 4. Itens
  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0006';
  end if;

  -- 5. Entrega
  if v_fulfillment_type = 'delivery' then
    if v_delivery_zone_id is null then
      raise exception 'delivery_zone_required' using errcode = 'P0007';
    end if;
    select * into v_zone from delivery_zones
    where id = v_delivery_zone_id and active = true;
    if not found then
      raise exception 'invalid_delivery_zone' using errcode = 'P0008';
    end if;
    v_delivery_fee := v_zone.fee_cents;
    if v_address is null or length(v_address) = 0 then
      raise exception 'delivery_address_required' using errcode = 'P0009';
    end if;
  end if;

  -- 6. Agendamento
  if v_scheduled_for is not null then
    if v_scheduled_for <= now() then
      raise exception 'scheduled_for_must_be_future' using errcode = 'P0010';
    end if;
    v_slot_hour   := extract(hour   from v_scheduled_for)::int;
    v_slot_minute := extract(minute from v_scheduled_for)::int;
    if v_slot_hour < v_cfg.open_hour or v_slot_hour >= v_cfg.close_hour then
      raise exception 'scheduled_for_outside_hours' using errcode = 'P0011';
    end if;
    if v_slot_minute % v_cfg.slot_minutes <> 0 then
      raise exception 'scheduled_for_invalid_slot' using errcode = 'P0012';
    end if;
  end if;

  -- 7. Validar cupom (antes de calcular subtotal para saber se há free_item)
  if v_referral_code is not null then
    select * into v_rc
    from referral_codes
    where code = v_referral_code
      and active = true
      and (expires_at is null or expires_at > now());

    if not found then
      raise exception 'referral_invalid_or_expired' using errcode = 'P0020';
    end if;

    -- Anti-abuso: auto-resgate
    if v_rc.owner_phone is not null and v_rc.owner_phone = v_customer_phone then
      raise exception 'referral_auto_redemption' using errcode = 'P0021';
    end if;

    -- Anti-abuso: mesmo telefone já usou este código
    if exists (
      select 1 from referral_redemptions
      where code_id = v_rc.id and customer_phone = v_customer_phone
    ) then
      raise exception 'referral_already_redeemed' using errcode = 'P0022';
    end if;

    -- Anti-abuso: max_redemptions atingido
    select count(*) into v_redeemed from referral_redemptions where code_id = v_rc.id;
    if v_redeemed >= v_rc.max_redemptions then
      raise exception 'referral_max_redemptions' using errcode = 'P0023';
    end if;

    -- Guardar gift_item_id se for free_item
    if v_rc.reward_type = 'free_item' then
      v_gift_item_id := v_rc.gift_item_id;
    end if;
  end if;

  -- 8. Calcular subtotal + verificar stock + variante/adicionais + is_gift
  for v_item_el in select * from jsonb_array_elements(v_items)
  loop
    v_qty := (v_item_el ->> 'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty' using errcode = 'P0013';
    end if;

    select mi.* into v_menu_item
    from menu_items mi
    where mi.id = (v_item_el ->> 'menuItemId')::uuid
      and mi.available = true;

    if not found then
      raise exception 'item_unavailable:%.', (v_item_el ->> 'menuItemId')
        using errcode = 'P0014';
    end if;

    -- is_gift sem cupom válido com free_item → rejeitar
    if v_menu_item.is_gift then
      if v_gift_item_id is null or v_gift_item_id != v_menu_item.id then
        raise exception 'gift_item_not_authorized' using errcode = 'P0024';
      end if;
      if v_qty > 1 then
        raise exception 'gift_item_max_one' using errcode = 'P0025';
      end if;
      v_has_gift_item := true;
      -- item grátis: preço 0 (não soma ao subtotal)
      continue;
    end if;

    -- Verificação de stock
    if v_menu_item.track_stock and v_menu_item.stock_qty < v_qty then
      raise exception 'out_of_stock:%.', v_menu_item.id using errcode = 'P0105';
    end if;

    -- Variante (opcional, escolha única): tem de pertencer ao item e estar ativa
    v_unit_price := v_menu_item.price_cents;
    if v_item_el ->> 'variantId' is not null then
      select * into v_variant
      from menu_item_variants
      where id = (v_item_el ->> 'variantId')::uuid
        and menu_item_id = v_menu_item.id
        and active = true;
      if not found then
        raise exception 'invalid_variant:%.', (v_item_el ->> 'variantId')
          using errcode = 'P0030';
      end if;
      v_unit_price := v_variant.price_cents;
    end if;

    -- ⭐ CORTE DE PREÇO: mesma função que o get_menu() usou na vitrine.
    v_unit_price := public.effective_price_cents(v_unit_price, v_menu_item.id, v_menu_item.category_id);

    -- Adicionais (opcional, multi): somam DEPOIS do desconto (não são descontados)
    v_addon_ids := coalesce(v_item_el -> 'addonIds', '[]'::jsonb);
    for v_addon_id in select * from jsonb_array_elements_text(v_addon_ids)
    loop
      select * into v_addon
      from menu_addons
      where id = v_addon_id::uuid
        and menu_item_id = v_menu_item.id
        and active = true;
      if not found then
        raise exception 'invalid_addon:%.', v_addon_id using errcode = 'P0031';
      end if;
      v_unit_price := v_unit_price + v_addon.price_cents;
    end loop;

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  end loop;

  -- 9. Aplicar desconto do cupom (calculado no servidor, ignorando valor do client).
  -- DECISÃO: nested IF em vez de AND composto — PostgreSQL não garante short-circuit
  -- em expressões SQL de IF, logo `v_rc.reward_type` seria avaliado mesmo sem cupom.
  -- NOTA: o cupom incide sobre o subtotal JÁ com os cortes de preço aplicados.
  if v_referral_code is not null then
    if v_rc.reward_type != 'free_item' then
      if v_rc.reward_type = 'discount_cents' then
        v_discount := least(v_rc.reward_value, v_subtotal); -- não negativa
      elsif v_rc.reward_type = 'discount_pct' then
        v_discount := (v_subtotal * v_rc.reward_value / 100);
      end if;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_fee;
  if v_total < 0 then v_total := 0; end if;

  -- 10. Order number
  v_order_number := 'ENC-' || lpad(nextval('order_number_seq')::text, 4, '0');

  -- 11. Criar pedido
  insert into orders (
    order_number, status, flow,
    fulfillment_type, delivery_zone_id, address,
    customer_name, customer_phone, customer_email,
    scheduled_for,
    subtotal_cents, delivery_fee_cents, total_cents,
    payment_method, notes,
    referral_code, discount_cents, gift_item_id
  ) values (
    v_order_number,
    case when v_flow = 'digital' then 'awaiting_payment' else 'awaiting_approval' end,
    v_flow,
    v_fulfillment_type, v_delivery_zone_id, v_address,
    v_customer_name, v_customer_phone, v_customer_email,
    v_scheduled_for,
    v_subtotal, v_delivery_fee, v_total,
    v_payment_method, v_notes,
    v_referral_code, v_discount, v_gift_item_id
  )
  returning id into v_order_id;

  -- 12. Order items (preços/variante/adicionais recalculados; snapshots imutáveis).
  --     NOTA: station vive em menu_categories (NÃO em menu_items) — join obrigatório.
  for v_item_el in select * from jsonb_array_elements(v_items)
  loop
    select mi.id, mi.name, mi.price_cents, mi.is_gift, mi.category_id,
           coalesce(c.station, 'kitchen') as station
    into v_menu_item
    from menu_items mi
    join menu_categories c on c.id = mi.category_id
    where mi.id = (v_item_el ->> 'menuItemId')::uuid;

    v_qty := (v_item_el ->> 'qty')::int;
    v_unit_price := v_menu_item.price_cents;
    v_variant_name := null;
    v_addons_snap := '[]'::jsonb;

    if v_menu_item.is_gift then
      v_unit_price := 0;
    else
      if v_item_el ->> 'variantId' is not null then
        select * into v_variant
        from menu_item_variants
        where id = (v_item_el ->> 'variantId')::uuid and menu_item_id = v_menu_item.id;
        v_unit_price := v_variant.price_cents;
        v_variant_name := v_variant.name;
      end if;

      -- ⭐ mesmo corte de preço do passo 8 (o snapshot guarda o preço REALMENTE pago)
      v_unit_price := public.effective_price_cents(v_unit_price, v_menu_item.id, v_menu_item.category_id);

      v_addon_ids := coalesce(v_item_el -> 'addonIds', '[]'::jsonb);
      v_addons_snap := '[]'::jsonb;
      for v_addon_id in select * from jsonb_array_elements_text(v_addon_ids)
      loop
        select * into v_addon from menu_addons where id = v_addon_id::uuid;
        v_unit_price := v_unit_price + v_addon.price_cents;
        v_addons_snap := v_addons_snap || jsonb_build_object('name', v_addon.name, 'price_cents', v_addon.price_cents);
      end loop;
    end if;

    insert into order_items (
      order_id, menu_item_id, name_snapshot, qty,
      unit_price_cents, station, notes,
      variant_name_snapshot, addons
    ) values (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_qty,
      v_unit_price,
      v_menu_item.station,
      nullif(trim(v_item_el ->> 'notes'), ''),
      v_variant_name,
      coalesce(v_addons_snap, '[]'::jsonb)
    );
  end loop;

  -- 13. Registar resgate do cupom
  if v_referral_code is not null then
    insert into referral_redemptions (code_id, order_id, customer_phone)
    values (v_rc.id, v_order_id, v_customer_phone);

    insert into event_log (order_id, type, payload)
    values (
      v_order_id,
      'referral.redeemed',
      jsonb_build_object(
        'code',         v_referral_code,
        'reward_type',  v_rc.reward_type,
        'reward_value', v_rc.reward_value,
        'discount',     v_discount,
        'has_gift',     v_has_gift_item
      )
    );
  end if;

  -- 14. Log do pedido
  insert into event_log (order_id, type, payload)
  values (
    v_order_id,
    'order.created',
    jsonb_build_object(
      'order_number',   v_order_number,
      'flow',           v_flow,
      'total_cents',    v_total,
      'discount_cents', v_discount,
      'fulfillment',    v_fulfillment_type,
      'payment_method', v_payment_method
    )
  );

  return v_order_id;
end;
$$;

-- ── 7. import_menu(): aceita compare_at_price_cents ──────────────────────────
-- Mesma idempotência (upsert por nome). Mantém o campo se o ficheiro não o trouxer? NÃO:
-- DECISÃO: o ficheiro é a fonte de verdade da lista — ausente/null limpa o corte manual,
-- para que "exportar → editar → importar" seja previsível (o que está no ficheiro é o que fica).
create or replace function public.import_menu(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat   jsonb;
  v_item  jsonb;
  v_cat_id uuid;
  v_cats  int := 0;
  v_items int := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload->'categories') <> 'array' then
    raise exception 'invalid_payload: esperado { categories: [...] }';
  end if;

  for v_cat in select * from jsonb_array_elements(p_payload->'categories') loop
    -- upsert categoria por nome
    select id into v_cat_id from menu_categories where name = v_cat->>'name' limit 1;
    if v_cat_id is null then
      insert into menu_categories (name, sort, station, active)
      values (
        v_cat->>'name',
        coalesce((v_cat->>'sort')::int, 0),
        coalesce(v_cat->>'station', 'kitchen'),
        coalesce((v_cat->>'active')::bool, true)
      )
      returning id into v_cat_id;
    else
      update menu_categories set
        sort    = coalesce((v_cat->>'sort')::int, sort),
        station = coalesce(v_cat->>'station', station),
        active  = coalesce((v_cat->>'active')::bool, active)
      where id = v_cat_id;
    end if;
    v_cats := v_cats + 1;

    for v_item in select * from jsonb_array_elements(v_cat->'items') loop
      if exists (select 1 from menu_items where category_id = v_cat_id and name = v_item->>'name') then
        update menu_items set
          description            = nullif(v_item->>'description', ''),
          price_cents            = (v_item->>'price_cents')::int,
          compare_at_price_cents = (v_item->>'compare_at_price_cents')::int,
          photo_url              = nullif(v_item->>'photo_url', ''),
          available              = coalesce((v_item->>'available')::bool, true),
          track_stock            = coalesce((v_item->>'track_stock')::bool, false),
          stock_qty              = coalesce((v_item->>'stock_qty')::int, 0),
          sort                   = coalesce((v_item->>'sort')::int, 0)
        where category_id = v_cat_id and name = v_item->>'name';
      else
        insert into menu_items
          (category_id, name, description, price_cents, compare_at_price_cents,
           photo_url, available, track_stock, stock_qty, sort)
        values (
          v_cat_id,
          v_item->>'name',
          nullif(v_item->>'description', ''),
          (v_item->>'price_cents')::int,
          (v_item->>'compare_at_price_cents')::int,
          nullif(v_item->>'photo_url', ''),
          coalesce((v_item->>'available')::bool, true),
          coalesce((v_item->>'track_stock')::bool, false),
          coalesce((v_item->>'stock_qty')::int, 0),
          coalesce((v_item->>'sort')::int, 0)
        );
      end if;
      v_items := v_items + 1;
    end loop;
  end loop;

  insert into event_log (type, payload)
  values ('menu.imported', jsonb_build_object('categories', v_cats, 'items', v_items));

  return jsonb_build_object('success', true, 'categories', v_cats, 'items', v_items);
end;
$$;

grant execute on function public.import_menu(jsonb) to authenticated;

-- ── 8. export_menu(): a lista inteira no formato canónico (staff) ────────────
-- Devolve { categories: [{ name, sort, station, active, items: [...] }] } com
-- price_cents/compare_at_price_cents em centavos — o CLI/admin convertem para MT.
create or replace function public.export_menu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',      c.id,
          'name',    c.name,
          'sort',    c.sort,
          'station', c.station,
          'active',  c.active,
          'items', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'id',                     i.id,
                'name',                   i.name,
                'description',            i.description,
                'price_cents',            i.price_cents,
                'compare_at_price_cents', i.compare_at_price_cents,
                'photo_url',              i.photo_url,
                'available',              i.available,
                'track_stock',            i.track_stock,
                'stock_qty',              i.stock_qty,
                'sort',                   i.sort
              ) order by i.sort, i.name
            ), '[]'::jsonb)
            from menu_items i where i.category_id = c.id
          )
        ) order by c.sort, c.name
      )
      from menu_categories c
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.export_menu() from public;
grant execute on function public.export_menu() to authenticated, service_role;
