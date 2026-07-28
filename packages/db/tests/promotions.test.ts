/**
 * Testes de integração — cortes de preço / promoções.
 * Requer `supabase start` + `supabase db reset` antes de correr.
 *
 * Prova a regra fundadora do padrão (docs/precos-e-promocoes.md):
 *   (a) get_menu() devolve o preço JÁ com desconto + compare_at_cents + discount_pct
 *   (b) create_order() COBRA esse preço (o client não decide nada)
 *   (c) campanha de categoria só toca a sua categoria
 *   (d) descontos não acumulam — vence o maior
 *   (e) campanha desligada/expirada não corta preço
 *   (f) compare_at_price_cents (corte manual) risca sem campanha nenhuma
 *   (g) anon não lê a tabela promotions
 *
 * Espelho em TypeScript: packages/core/src/pricing.ts (testado sem BD).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54531';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: SupabaseClient;
let anon: SupabaseClient;

let categoryId: string;
let otherCategoryId: string;
let itemId: string;
let itemPrice: number;
let otherItemId: string;
let otherItemPrice: number;

type MenuPayload = {
  categories: {
    id: string;
    items: { id: string; price_cents: number; compare_at_cents: number | null; discount_pct: number }[];
  }[];
};

async function menuItem(id: string) {
  const { data } = await anon.rpc('get_menu');
  const menu = data as MenuPayload;
  for (const c of menu.categories) {
    const found = c.items.find((i) => i.id === id);
    if (found) return found;
  }
  throw new Error(`Item ${id} não veio no get_menu()`);
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY);
  anon  = createClient(SUPABASE_URL, ANON_KEY);

  await admin.from('settings').update({ payment_provider: 'manual', accepting_orders: true }).eq('id', 1);

  const { data: cats } = await admin
    .from('menu_categories')
    .select('id')
    .eq('active', true)
    .order('sort')
    .limit(2);
  if (!cats || cats.length < 2) throw new Error('Setup: seed precisa de 2 categorias ativas');
  categoryId = cats[0].id;
  otherCategoryId = cats[1].id;

  const { data: items } = await admin
    .from('menu_items')
    .select('id, price_cents, category_id')
    .eq('available', true)
    .in('category_id', [categoryId, otherCategoryId]);
  if (!items) throw new Error('Setup: sem itens');

  const first = items.find((i) => i.category_id === categoryId);
  const second = items.find((i) => i.category_id === otherCategoryId);
  if (!first || !second) throw new Error('Setup: cada categoria precisa de 1 item');

  itemId = first.id;
  itemPrice = first.price_cents;
  otherItemId = second.id;
  otherItemPrice = second.price_cents;
});

afterEach(async () => {
  await admin.from('promotions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('menu_items').update({ compare_at_price_cents: null }).eq('id', itemId);
});

describe('get_menu() — preço já cortado', () => {
  it('sem campanha: preço de tabela, sem riscado', async () => {
    const item = await menuItem(itemId);
    expect(item.price_cents).toBe(itemPrice);
    expect(item.compare_at_cents).toBeNull();
    expect(item.discount_pct).toBe(0);
  });

  it('campanha de loja -50%: preço a metade, riscado no preço antigo', async () => {
    await admin.from('promotions').insert({
      name: 'Teste loja', scope: 'store', discount_type: 'pct', discount_value: 50, active: true,
    });

    const item = await menuItem(itemId);
    expect(item.price_cents).toBe(itemPrice - Math.round(itemPrice * 0.5));
    expect(item.compare_at_cents).toBe(itemPrice);
    expect(item.discount_pct).toBe(50);
  });

  it('campanha de categoria só toca a sua categoria', async () => {
    await admin.from('promotions').insert({
      name: 'Só esta categoria', scope: 'category', category_id: categoryId,
      discount_type: 'pct', discount_value: 30, active: true,
    });

    const dentro = await menuItem(itemId);
    const fora = await menuItem(otherItemId);
    expect(dentro.price_cents).toBe(itemPrice - Math.round(itemPrice * 0.3));
    expect(fora.price_cents).toBe(otherItemPrice);
    expect(fora.compare_at_cents).toBeNull();
  });

  it('não acumula: loja -50% + categoria -30% → vence 50%', async () => {
    await admin.from('promotions').insert([
      { name: 'Loja', scope: 'store', discount_type: 'pct', discount_value: 50, active: true },
      { name: 'Cat', scope: 'category', category_id: categoryId, discount_type: 'pct', discount_value: 30, active: true },
    ]);

    const item = await menuItem(itemId);
    expect(item.price_cents).toBe(itemPrice - Math.round(itemPrice * 0.5));
  });

  it('campanha desligada ou expirada não corta preço', async () => {
    await admin.from('promotions').insert([
      { name: 'Off', scope: 'store', discount_type: 'pct', discount_value: 40, active: false },
      {
        name: 'Expirada', scope: 'store', discount_type: 'pct', discount_value: 60, active: true,
        ends_at: new Date(Date.now() - 3600_000).toISOString(),
      },
    ]);

    const item = await menuItem(itemId);
    expect(item.price_cents).toBe(itemPrice);
    expect(item.discount_pct).toBe(0);
  });

  it('compare_at_price_cents (corte manual) risca sem campanha', async () => {
    await admin.from('menu_items').update({ compare_at_price_cents: itemPrice * 2 }).eq('id', itemId);

    const item = await menuItem(itemId);
    expect(item.price_cents).toBe(itemPrice);
    expect(item.compare_at_cents).toBe(itemPrice * 2);
    expect(item.discount_pct).toBe(50);
  });
});

describe('create_order() — cobra o preço cortado', () => {
  it('o pedido usa o preço com desconto, não o de tabela', async () => {
    await admin.from('promotions').insert({
      name: 'Loja -30%', scope: 'store', discount_type: 'pct', discount_value: 30, active: true,
    });

    const esperado = itemPrice - Math.round(itemPrice * 0.3);

    const { data: orderId, error } = await anon.rpc('create_order', {
      p_payload: {
        items: [{ menuItemId: itemId, qty: 2 }],
        customerName: 'Cliente Promo',
        customerPhone: '840000001',
        fulfillmentType: 'pickup',
        paymentMethod: 'mpesa',
      },
    });
    expect(error).toBeNull();

    const { data: order } = await admin
      .from('orders')
      .select('subtotal_cents, total_cents')
      .eq('id', orderId as string)
      .single();
    const { data: lines } = await admin
      .from('order_items')
      .select('unit_price_cents, qty')
      .eq('order_id', orderId as string);

    expect(lines?.[0].unit_price_cents).toBe(esperado);
    expect(order?.subtotal_cents).toBe(esperado * 2);
    expect(order?.total_cents).toBe(esperado * 2);
  });

  it('preço adulterado no payload continua a não valer nada', async () => {
    await admin.from('promotions').insert({
      name: 'Loja -50%', scope: 'store', discount_type: 'pct', discount_value: 50, active: true,
    });

    const { data: orderId } = await anon.rpc('create_order', {
      p_payload: {
        items: [{ menuItemId: itemId, qty: 1, price_cents: 1, unit_price_cents: 1 }],
        customerName: 'Cliente Esperto',
        customerPhone: '840000002',
        fulfillmentType: 'pickup',
        paymentMethod: 'mpesa',
      },
    });

    const { data: lines } = await admin
      .from('order_items')
      .select('unit_price_cents')
      .eq('order_id', orderId as string);
    expect(lines?.[0].unit_price_cents).toBe(itemPrice - Math.round(itemPrice * 0.5));
  });
});

describe('RLS — promotions', () => {
  it('anon não lê promotions direto', async () => {
    const { data, error } = await anon.from('promotions').select('*');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
