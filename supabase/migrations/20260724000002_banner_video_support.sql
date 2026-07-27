-- ============================================================================
-- ECOMMERCE-PADRAO — banners aceitam video (16:9) alem de imagem
-- ============================================================================

alter table public.storefront_banners
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));

-- Bucket storefront-assets: aceita video (mp4/webm) alem de imagem; limite maior.
update storage.buckets
set
  file_size_limit = 52428800, -- 50 MB (video precisa de mais espaço que imagem)
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'storefront-assets';

-- get_menu(): banners[] passa a incluir media_type.
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
    'promo_banner_url',  v_s.promo_banner_url,
    'promo_code',        v_s.promo_code,
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
