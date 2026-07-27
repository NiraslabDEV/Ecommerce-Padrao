-- ============================================================================
-- Fix: em confirm_payment, o loop de dedução de stock fazia
-- `insert into event_log (...'payment.stock_insufficient'...)` e a seguir
-- `raise exception 'out_of_stock:...'` NA MESMA transação — o raise desfaz
-- TUDO incluindo o próprio insert do event_log. Resultado: sempre que o
-- webhook/cron/verify do Paysuite tentava confirmar um pagamento com stock
-- entretanto esgotado, a falha não deixava rasto nenhum em event_log (só um
-- console.error efémero na rota). Descoberto ao correr
-- packages/db/tests/stock.test.ts (teste (c)) contra Supabase local.
--
-- Fix: isola o loop de dedução num bloco BEGIN/EXCEPTION (savepoint implícito
-- do plpgsql) — ao apanhar out_of_stock, desfaz só as deduções desse bloco,
-- grava o event_log DEPOIS do rollback do savepoint (por isso sobrevive), e
-- devolve 'out_of_stock' em vez de propagar a exceção — mesmo padrão já usado
-- por 'amount_mismatch'/'invalid_state' nesta função (CLAUDE.md 6.4). Os
-- consumidores (webhook/cron/verify) já toleram qualquer resultado != 'ok'
-- sem tratamento especial, por isso este ficheiro não muda a rota.
--
-- advance_order (aprovação manual) NÃO foi alterada: continua a fazer RAISE
-- porque o painel (pedidos/page.tsx) depende do erro do RPC para mostrar a
-- falha ao dono em tempo real — trocar o contrato ali exigiria também mudar
-- o front, fora do escopo desta correção pontual.
-- ============================================================================

create or replace function public.confirm_payment(
  p_idempotency_key text, p_order_id uuid, p_provider text, p_provider_ref text,
  p_method text, p_amount_cents int, p_raw_webhook jsonb default '{}'::jsonb
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_inserted int; v_payment_id uuid; v_order record; v_item_el record; v_updated int;
  v_tracks boolean; v_zone_name text; v_items jsonb := '[]'::jsonb; v_oos_item_id uuid;
begin
  insert into payments (order_id, provider, provider_ref, method, amount_cents, idempotency_key, raw_webhook)
  values (p_order_id, p_provider, p_provider_ref, p_method, p_amount_cents, p_idempotency_key, p_raw_webhook)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;
  select id into v_payment_id from payments where idempotency_key = p_idempotency_key;
  select o.id, o.status, o.total_cents, o.order_number, o.flow, o.fulfillment_type, o.delivery_zone_id, o.address, o.customer_name, o.customer_phone, o.scheduled_for, o.payment_method, o.notes, o.created_at
  into v_order from orders o where o.id = p_order_id for update;
  if not found then
    insert into event_log (order_id, type, payload) values (p_order_id, 'payment.order_not_found', jsonb_build_object('idempotency_key', p_idempotency_key));
    return 'order_not_found';
  end if;
  if p_amount_cents != v_order.total_cents then
    insert into event_log (order_id, type, payload) values (p_order_id, 'payment.amount_mismatch', jsonb_build_object('expected', v_order.total_cents, 'received', p_amount_cents, 'idempotency_key', p_idempotency_key));
    return 'amount_mismatch';
  end if;

  begin
    for v_item_el in select oi.menu_item_id, oi.qty from order_items oi where oi.order_id = p_order_id loop
      update menu_items set stock_qty = stock_qty - v_item_el.qty where id = v_item_el.menu_item_id and track_stock = true and stock_qty >= v_item_el.qty;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        select track_stock into v_tracks from menu_items where id = v_item_el.menu_item_id;
        if coalesce(v_tracks, false) then
          v_oos_item_id := v_item_el.menu_item_id;
          raise exception 'out_of_stock:%.', v_item_el.menu_item_id using errcode = 'P0105';
        end if;
      end if;
    end loop;
  exception
    when sqlstate 'P0105' then
      -- savepoint do bloco já desfez as deduções; log sobrevive ao return abaixo.
      insert into event_log (order_id, type, payload) values (p_order_id, 'payment.stock_insufficient', jsonb_build_object('menu_item_id', v_oos_item_id, 'idempotency_key', p_idempotency_key));
      return 'out_of_stock';
  end;

  update payments set status = 'confirmed' where id = v_payment_id;
  if v_order.status not in ('awaiting_payment', 'payment_failed') then
    insert into event_log (order_id, type, payload) values (p_order_id, 'payment.confirmed_on_invalid_state', jsonb_build_object('status', v_order.status, 'idempotency_key', p_idempotency_key));
    return 'invalid_state';
  end if;
  update orders set status = 'paid', updated_at = now() where id = p_order_id;
  if v_order.fulfillment_type = 'delivery' and v_order.delivery_zone_id is not null then
    select name into v_zone_name from delivery_zones where id = v_order.delivery_zone_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'quantity', oi.qty, 'notes', oi.notes) order by oi.id), '[]'::jsonb) into v_items from order_items oi where oi.order_id = p_order_id;
  insert into print_jobs (order_id, station, payload) values (p_order_id, 'kitchen', jsonb_build_object('order_number', v_order.order_number, 'customer_name', v_order.customer_name, 'fulfillment_type', v_order.fulfillment_type, 'delivery_zone', v_zone_name, 'address', v_order.address, 'scheduled_for', v_order.scheduled_for, 'items', v_items, 'payment_method', v_order.payment_method, 'payment_status', 'paid', 'total_cents', v_order.total_cents, 'notes', v_order.notes, 'created_at', v_order.created_at));
  insert into event_log (order_id, type, payload) values (p_order_id, 'payment.confirmed', jsonb_build_object('provider', p_provider, 'method', p_method, 'amount_cents', p_amount_cents));
  return 'ok';
end;
$$;
