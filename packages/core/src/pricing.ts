import { cents, type Cents } from './money';

/**
 * MOTOR DE CORTES DE PREÇO (promoções) — padrão único do template.
 * Documentado em `docs/precos-e-promocoes.md`.
 *
 * Regras fechadas:
 *  1. `menu_items.price_cents` é SEMPRE o preço de tabela do produto. Campanhas
 *     nunca o reescrevem (ligar/desligar uma campanha não perde o preço original).
 *  2. `menu_items.compare_at_price_cents` é o "de X" riscado de UM produto
 *     (corte manual "de 1200 por 900"). Se for ≤ ao preço, é ignorado.
 *  3. `promotions` são REGRAS por escopo — `store` (loja inteira), `category`
 *     (ex.: todos os perfumes) ou `item` — em `pct` (%) ou `cents` (MT fixo).
 *  4. Descontos NÃO acumulam: aplica-se o de MAIOR desconto.
 *  5. Dinheiro é sempre centavos inteiros; a percentagem arredonda ao cêntimo.
 *
 * ⚠️ A autoridade em runtime é a função SQL `public.effective_price()` (mesma
 * migration): é ela que alimenta o `get_menu()` e o `create_order()`. Este módulo
 * é o ESPELHO em TypeScript, usado para preview no front e para os testes.
 * Mudar uma regra aqui obriga a mudar a função SQL — e vice-versa.
 */

export type PromotionScope = 'store' | 'category' | 'item';
export type DiscountType = 'pct' | 'cents';

export interface Promotion {
  id?: string;
  name?: string;
  scope: PromotionScope;
  category_id?: string | null;
  menu_item_id?: string | null;
  discount_type: DiscountType;
  /** `pct`: 1..100 · `cents`: valor fixo em centavos */
  discount_value: number;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** Onde o produto vive — decide que campanhas lhe tocam. */
export interface PriceContext {
  itemId: string;
  categoryId: string | null;
}

export interface EffectivePrice {
  /** O que o cliente paga (o servidor cobra exatamente isto). */
  price_cents: Cents;
  /** Preço riscado a mostrar, ou `null` se não há corte. */
  compare_at_cents: Cents | null;
  /** Badge "-30%" (inteiro, 0 quando não há corte). */
  discount_pct: number;
}

/** A campanha está ligada, dentro da janela e toca este produto? */
export function promoApplies(promo: Promotion, ctx: PriceContext, now: Date = new Date()): boolean {
  if (promo.active === false) return false;
  if (promo.starts_at && new Date(promo.starts_at) > now) return false;
  if (promo.ends_at && new Date(promo.ends_at) <= now) return false;

  switch (promo.scope) {
    case 'store':
      return true;
    case 'category':
      return !!promo.category_id && promo.category_id === ctx.categoryId;
    case 'item':
      return !!promo.menu_item_id && promo.menu_item_id === ctx.itemId;
    default:
      return false;
  }
}

/** Desconto (em centavos) que UMA campanha faz sobre um preço base. */
export function promoDiscountCents(baseCents: Cents | number, promo: Promotion): number {
  const base = Math.max(0, Math.trunc(baseCents));
  if (promo.discount_type === 'pct') {
    const pct = Math.min(100, Math.max(0, promo.discount_value));
    return Math.min(base, Math.round((base * pct) / 100));
  }
  return Math.min(base, Math.max(0, Math.trunc(promo.discount_value)));
}

/** Maior desconto entre as campanhas aplicáveis (não acumula). */
export function bestDiscountCents(
  baseCents: Cents | number,
  promos: Promotion[],
  ctx: PriceContext,
  now: Date = new Date(),
): number {
  return promos.reduce(
    (best, p) => (promoApplies(p, ctx, now) ? Math.max(best, promoDiscountCents(baseCents, p)) : best),
    0,
  );
}

/**
 * Preço final + preço riscado + % de desconto.
 * `compareAtCents` é o corte manual do produto (pode ser null).
 */
export function effectivePrice(
  baseCents: Cents | number,
  compareAtCents: Cents | number | null,
  promos: Promotion[],
  ctx: PriceContext,
  now: Date = new Date(),
): EffectivePrice {
  const base = Math.max(0, Math.trunc(baseCents));
  const discount = bestDiscountCents(base, promos, ctx, now);
  const final = Math.max(0, base - discount);

  // Referência riscada: o maior entre o "de X" do produto e o preço de tabela.
  const reference = Math.max(Math.trunc(compareAtCents ?? 0), base);
  const hasCut = reference > final;

  return {
    price_cents: cents(final),
    compare_at_cents: hasCut ? cents(reference) : null,
    discount_pct: hasCut ? Math.round((1 - final / reference) * 100) : 0,
  };
}
