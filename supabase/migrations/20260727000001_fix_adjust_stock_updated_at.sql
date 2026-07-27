-- ============================================================================
-- Fix: adjust_stock (migration 0010) fazia `update menu_items set ...,
-- updated_at = now()`, mas `menu_items` NUNCA teve coluna `updated_at`
-- (só `orders` tem). Toda chamada a adjust_stock falhava com
-- "column \"updated_at\" of relation \"menu_items\" does not exist".
-- Descoberto ao correr packages/db/tests/stock.test.ts (F2.3) pela primeira
-- vez contra Supabase local — o RPC nunca tinha sido exercitado em runtime.
-- ============================================================================

create or replace function public.adjust_stock(
  p_menu_item_id uuid,
  p_new_qty      int,
  p_reason       text,
  p_adjusted_by  text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     record;
  v_old_qty  int;
  v_diff     int;
begin
  if p_new_qty < 0 then
    raise exception 'invalid_stock_qty: cannot be negative' using errcode = 'P0100';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'adjust_reason_required' using errcode = 'P0101';
  end if;

  select mi.id, mi.name, mi.stock_qty, mi.track_stock, mi.available
  into v_item
  from menu_items mi
  where mi.id = p_menu_item_id
  for update;

  if not found then
    raise exception 'menu_item_not_found' using errcode = 'P0102';
  end if;

  if not v_item.track_stock then
    raise exception 'stock_not_tracked: item does not track stock' using errcode = 'P0103';
  end if;

  v_old_qty := v_item.stock_qty;
  v_diff    := p_new_qty - v_old_qty;

  update menu_items
  set stock_qty = p_new_qty
  where id = p_menu_item_id;

  insert into event_log (order_id, type, payload)
  values (
    null,
    'stock.adjusted',
    jsonb_build_object(
      'menu_item_id', p_menu_item_id,
      'menu_item_name', v_item.name,
      'old_qty', v_old_qty,
      'new_qty', p_new_qty,
      'diff', v_diff,
      'reason', p_reason,
      'adjusted_by', p_adjusted_by
    )
  );

  return jsonb_build_object(
    'success', true,
    'menu_item_id', p_menu_item_id,
    'menu_item_name', v_item.name,
    'old_qty', v_old_qty,
    'new_qty', p_new_qty,
    'diff', v_diff
  );
end;
$$;
