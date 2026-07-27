-- ============================================================================
-- ECOMMERCE-PADRAO — Banners de categoria na Home (ate 10, recomendado 3)
-- Admin faz upload + define o link (categoria especifica OU URL customizada) +
-- ve metricas de clique (reaproveita analytics_events, tipo 'banner_click').
-- get_menu() passa a devolver banners[] (so ativos, ordenados por sort) —
-- campo publico, mesmo padrao de zones/categories.
-- ============================================================================

create table if not exists public.storefront_banners (
  id          uuid        primary key default gen_random_uuid(),
  image_url   text        not null,
  category_id uuid        null references public.menu_categories(id) on delete set null,
  custom_url  text        null,
  sort        int         not null default 0,
  active      bool        not null default true,
  created_at  timestamptz not null default now()
);

alter table public.storefront_banners enable row level security;

create policy "staff_all" on public.storefront_banners
  for all to authenticated using (true) with check (true);

-- get_menu(): adiciona banners[] (só ativos, ordenados por sort).
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
              jsonb_build_object(
                'id',          i.id,
                'name',        i.name,
                'description', i.description,
                'price_cents', i.price_cents,
                'photo_url',   i.photo_url,
                'available',   i.available,
                'variants', (
                  select coalesce(jsonb_agg(
                    jsonb_build_object(
                      'id',          v.id,
                      'name',        v.name,
                      'price_cents', v.price_cents,
                      'is_default',  v.is_default
                    ) order by v.sort
                  ), '[]'::jsonb)
                  from menu_item_variants v
                  where v.menu_item_id = i.id and v.active = true
                ),
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

-- get_banner_clicks(): contagem de cliques por banner (analytics_events.type = 'banner_click').
-- Staff-only (SECURITY DEFINER so para uniformidade; RLS ja bloqueia anon em analytics_events).
create or replace function public.get_banner_clicks()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  return (
    select coalesce(jsonb_object_agg(banner_id, clicks), '{}'::jsonb)
    from (
      select payload->>'banner_id' as banner_id, count(*) as clicks
      from analytics_events
      where type = 'banner_click' and payload->>'banner_id' is not null
      group by payload->>'banner_id'
    ) t
  );
end;
$$;

grant execute on function public.get_banner_clicks() to authenticated;
