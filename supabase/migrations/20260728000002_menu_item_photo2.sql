-- ============================================================================
-- 2ª foto opcional por produto — permite crossfade no hover/scroll (F-loja).
-- Com só 1 foto, o front cai automaticamente no efeito Ken Burns (zoom/pan).
-- Segue o mesmo padrão aditivo da 20260728000001 (video_url).
-- ============================================================================

alter table menu_items add column if not exists photo_url_2 text;

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
