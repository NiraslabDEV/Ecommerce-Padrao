/**
 * Motor de cortes de preço (promoções).
 *
 * Estes testes fixam o PADRÃO documentado em docs/precos-e-promocoes.md:
 *   - price_cents é sempre o preço de tabela do produto (o dono não o mexe em campanhas)
 *   - compare_at_price_cents é o "de X" riscado de UM produto
 *   - promotions são regras (loja / categoria / produto) em % ou MT fixo
 *   - descontos NÃO acumulam: vence o de MAIOR desconto
 *   - o preço final nunca é negativo e é sempre inteiro (centavos)
 *
 * A função SQL public.effective_price() é o espelho autoritativo disto:
 * qualquer mudança aqui tem de ser feita na migration também.
 */
import { describe, it, expect } from 'vitest';
import type { Cents } from '../money';
import {
  promoApplies,
  promoDiscountCents,
  bestDiscountCents,
  effectivePrice,
  type Promotion,
} from '../pricing';

const CAT_PERFUMES = '11111111-1111-1111-1111-111111111111';
const CAT_ROUPA = '22222222-2222-2222-2222-222222222222';
const ITEM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const NOW = new Date('2026-07-28T12:00:00Z');
const ctxA = { itemId: ITEM_A, categoryId: CAT_PERFUMES };

function promo(p: Partial<Promotion>): Promotion {
  return {
    scope: 'store',
    category_id: null,
    menu_item_id: null,
    discount_type: 'pct',
    discount_value: 10,
    active: true,
    starts_at: null,
    ends_at: null,
    ...p,
  };
}

describe('promoApplies — escopo e janela', () => {
  it('loja inteira aplica a qualquer produto', () => {
    expect(promoApplies(promo({ scope: 'store' }), ctxA, NOW)).toBe(true);
  });

  it('categoria só aplica aos produtos dessa categoria', () => {
    const p = promo({ scope: 'category', category_id: CAT_PERFUMES });
    expect(promoApplies(p, ctxA, NOW)).toBe(true);
    expect(promoApplies(p, { itemId: ITEM_B, categoryId: CAT_ROUPA }, NOW)).toBe(false);
  });

  it('produto só aplica àquele produto', () => {
    const p = promo({ scope: 'item', menu_item_id: ITEM_A });
    expect(promoApplies(p, ctxA, NOW)).toBe(true);
    expect(promoApplies(p, { itemId: ITEM_B, categoryId: CAT_PERFUMES }, NOW)).toBe(false);
  });

  it('campanha desligada não aplica', () => {
    expect(promoApplies(promo({ active: false }), ctxA, NOW)).toBe(false);
  });

  it('campanha agendada para o futuro ainda não aplica', () => {
    expect(promoApplies(promo({ starts_at: '2026-08-01T00:00:00Z' }), ctxA, NOW)).toBe(false);
  });

  it('campanha expirada deixa de aplicar', () => {
    expect(promoApplies(promo({ ends_at: '2026-07-01T00:00:00Z' }), ctxA, NOW)).toBe(false);
  });

  it('dentro da janela aplica', () => {
    const p = promo({ starts_at: '2026-07-01T00:00:00Z', ends_at: '2026-08-01T00:00:00Z' });
    expect(promoApplies(p, ctxA, NOW)).toBe(true);
  });
});

describe('promoDiscountCents — % e valor fixo', () => {
  it('30% de 1000 MT = 300 MT', () => {
    expect(promoDiscountCents(100000 as Cents, promo({ discount_type: 'pct', discount_value: 30 }))).toBe(30000);
  });

  it('arredonda ao cêntimo mais próximo (nunca float)', () => {
    // 33% de 999 cents = 329,67 → 330
    expect(promoDiscountCents(999 as Cents, promo({ discount_type: 'pct', discount_value: 33 }))).toBe(330);
    expect(Number.isInteger(promoDiscountCents(999 as Cents, promo({ discount_value: 33 })))).toBe(true);
  });

  it('valor fixo nunca desconta mais do que o preço', () => {
    const p = promo({ discount_type: 'cents', discount_value: 50000 });
    expect(promoDiscountCents(30000 as Cents, p)).toBe(30000);
  });

  it('percentagem é limitada a 0..100', () => {
    expect(promoDiscountCents(10000 as Cents, promo({ discount_value: 150 }))).toBe(10000);
    expect(promoDiscountCents(10000 as Cents, promo({ discount_value: -20 }))).toBe(0);
  });
});

describe('bestDiscountCents — não acumula, vence o maior', () => {
  const promos = [
    promo({ scope: 'store', discount_type: 'pct', discount_value: 50 }),
    promo({ scope: 'category', category_id: CAT_PERFUMES, discount_type: 'pct', discount_value: 30 }),
  ];

  it('loja 50% + categoria 30% → 50% (não 65%, não 80%)', () => {
    expect(bestDiscountCents(100000 as Cents, promos, ctxA, NOW)).toBe(50000);
  });

  it('ignora campanhas fora do escopo do produto', () => {
    const outro = { itemId: ITEM_B, categoryId: CAT_ROUPA };
    expect(bestDiscountCents(100000 as Cents, promos, outro, NOW)).toBe(50000); // só a de loja
  });

  it('sem campanhas → desconto 0', () => {
    expect(bestDiscountCents(100000 as Cents, [], ctxA, NOW)).toBe(0);
  });

  it('campanha de produto pode ganhar à de loja', () => {
    const lista = [
      promo({ scope: 'store', discount_value: 10 }),
      promo({ scope: 'item', menu_item_id: ITEM_A, discount_type: 'cents', discount_value: 40000 }),
    ];
    expect(bestDiscountCents(100000 as Cents, lista, ctxA, NOW)).toBe(40000);
  });
});

describe('effectivePrice — o que a loja mostra e o servidor cobra', () => {
  it('sem corte nenhum: paga o preço de tabela, sem riscado', () => {
    const r = effectivePrice(100000 as Cents, null, [], ctxA, NOW);
    expect(r).toEqual({ price_cents: 100000, compare_at_cents: null, discount_pct: 0 });
  });

  it('corte manual "de 1200 por 900" (compare_at no produto)', () => {
    const r = effectivePrice(90000 as Cents, 120000 as Cents, [], ctxA, NOW);
    expect(r.price_cents).toBe(90000);
    expect(r.compare_at_cents).toBe(120000);
    expect(r.discount_pct).toBe(25);
  });

  it('campanha de categoria 30% em todos os perfumes', () => {
    const p = [promo({ scope: 'category', category_id: CAT_PERFUMES, discount_value: 30 })];
    const r = effectivePrice(100000 as Cents, null, p, ctxA, NOW);
    expect(r.price_cents).toBe(70000);
    expect(r.compare_at_cents).toBe(100000);
    expect(r.discount_pct).toBe(30);
  });

  it('loja inteira a 50%', () => {
    const p = [promo({ scope: 'store', discount_value: 50 })];
    const r = effectivePrice(25000 as Cents, null, p, ctxA, NOW);
    expect(r.price_cents).toBe(12500);
    expect(r.discount_pct).toBe(50);
  });

  it('compare_at + campanha: risca sempre o maior preço de referência', () => {
    // produto já estava "de 1200 por 900"; campanha de loja tira 50% do preço de tabela (900)
    const p = [promo({ scope: 'store', discount_value: 50 })];
    const r = effectivePrice(90000 as Cents, 120000 as Cents, p, ctxA, NOW);
    expect(r.price_cents).toBe(45000);
    expect(r.compare_at_cents).toBe(120000);
    expect(r.discount_pct).toBe(63); // 1 - 450/1200 = 62,5% → 63
  });

  it('compare_at inferior ao preço é ignorado (não inventa desconto)', () => {
    const r = effectivePrice(100000 as Cents, 80000 as Cents, [], ctxA, NOW);
    expect(r.price_cents).toBe(100000);
    expect(r.compare_at_cents).toBe(null);
    expect(r.discount_pct).toBe(0);
  });

  it('nunca devolve preço negativo', () => {
    const p = [promo({ scope: 'store', discount_type: 'cents', discount_value: 999999 })];
    const r = effectivePrice(5000 as Cents, null, p, ctxA, NOW);
    expect(r.price_cents).toBe(0);
    expect(r.price_cents).toBeGreaterThanOrEqual(0);
  });

  it('campanha expirada não corta preço nenhum', () => {
    const p = [promo({ scope: 'store', discount_value: 50, ends_at: '2026-07-01T00:00:00Z' })];
    const r = effectivePrice(100000 as Cents, null, p, ctxA, NOW);
    expect(r.price_cents).toBe(100000);
    expect(r.compare_at_cents).toBe(null);
  });

  it('preço final é sempre inteiro (centavos)', () => {
    const p = [promo({ scope: 'store', discount_value: 33 })];
    const r = effectivePrice(99999 as Cents, null, p, ctxA, NOW);
    expect(Number.isInteger(r.price_cents)).toBe(true);
    expect(r.price_cents).toBe(99999 - 33000); // 33% de 99999 = 32999,67 → 33000
  });
});
